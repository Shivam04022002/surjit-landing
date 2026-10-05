process.env.ANALYTICS_RATE_LIMIT_MAX = '1000';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { harness, idempotencyKey, validLead } = require('./helpers');
const AnalyticsEvent = require('../src/models/AnalyticsEvent');
const { deviceTypeOf, isBot } = require('../src/services/analytics.service');

const SESSION = 'abcdef0123456789abcdef0123456789';
const send = (body, headers) => harness.call('POST', '/api/analytics/events', { body, headers });
const base = (name, extra = {}) => ({ name, sessionId: SESSION, path: '/', ...extra });

before(() => harness.start());
after(() => harness.stop());
beforeEach(() => AnalyticsEvent.deleteMany({}));

describe('Event allowlist', () => {
    test('every known event with its required detail is recorded', async () => {
        const events = [
            base('page_view'), base('session_start'), base('form_start'),
            base('form_step_viewed', { step: 2 }), base('form_step_completed', { step: 1 }),
            base('validation_error', { step: 4, field: 'phoneNumber' }),
            base('form_submit_attempted'), base('form_submit_succeeded'),
            base('form_submit_failed', { reason: 'server' }),
            base('cta_click', { ctaId: 'hero_apply' }), base('nav_click', { navTarget: 'faq' }),
            base('faq_open', { faqId: 'documents-needed' })
        ];
        for (const e of events) {
            const res = await send(e);
            assert.equal(res.status, 202, e.name);
        }
        assert.equal(await AnalyticsEvent.countDocuments(), events.length);
    });

    test('unknown events, paths, steps, fields and CTAs are rejected', async () => {
        const bad = [
            base('purchase'),
            base('page_view', { path: '/admin' }),
            base('page_view', { path: '/?utm_source=x' }),
            base('form_step_viewed', { step: 5 }),
            base('form_step_viewed'),
            base('validation_error', { step: 1, field: 'password' }),
            base('cta_click', { ctaId: 'https://evil.example' }),
            base('nav_click', { navTarget: 'admin' }),
            base('faq_open', { faqId: 'Has Spaces' }),
            base('form_submit_failed', { reason: 'Error: boom' }),
            { name: 'page_view', sessionId: 'x', path: '/' },
            { name: 'page_view', sessionId: SESSION }
        ];
        for (const e of bad) {
            const res = await send(e);
            assert.equal(res.status, 400, JSON.stringify(e));
        }
        assert.equal(await AnalyticsEvent.countDocuments(), 0);
    });
});

describe('Sensitive data never reaches analytics', () => {
    test('form values sent in an event body are dropped, not stored', async () => {
        const lead = validLead();
        const res = await send({ ...base('form_submit_succeeded'), ...lead, value: lead, email: 'ravi@example.com' });
        assert.equal(res.status, 202);

        const raw = await mongoose.connection.db.collection('analyticsevents').find({}).toArray();
        assert.equal(raw.length, 1);
        const json = JSON.stringify(raw[0]);
        for (const v of ['9876543210', '226001', 'Sharma', '250000', '1.5L-3L', '650-750', 'ravi@example.com', 'Lucknow']) {
            assert.ok(!json.includes(v), `${v} must not be stored`);
        }
        const allowed = ['_id', 'name', 'sessionId', 'path', 'step', 'field', 'ctaId', 'navTarget', 'faqId',
            'reason', 'referrerHost', 'utm', 'deviceType', 'occurredAt'];
        assert.deepEqual(Object.keys(raw[0]).filter((k) => !allowed.includes(k)), []);
    });

    test('a validation_error records the field name only', async () => {
        await send(base('validation_error', { step: 4, field: 'phoneNumber', value: 'typed-by-visitor' }));
        const doc = await AnalyticsEvent.findOne({}).lean();
        assert.equal(doc.field, 'phoneNumber');
        assert.ok(!JSON.stringify(doc).includes('typed-by-visitor'));
    });

    test('no IP address or user-agent string is stored', async () => {
        await send(base('page_view'), { 'X-Forwarded-For': '49.36.1.10' });
        const raw = await mongoose.connection.db.collection('analyticsevents').findOne({});
        const json = JSON.stringify(raw);
        assert.ok(!json.includes('49.36.1.10'));
        assert.ok(!json.includes('127.0.0.1'));
        assert.ok(!/Mozilla|Chrome|Android 14/.test(json));
        assert.equal(raw.deviceType, 'mobile');
    });

    test('submitting a lead records no analytics event', async () => {
        await harness.call('POST', '/api/leads', { body: validLead(), headers: { 'Idempotency-Key': idempotencyKey() } });
        assert.equal(await AnalyticsEvent.countDocuments(), 0);
    });
});

describe('Attribution', () => {
    test('page_view keeps the referrer host and well-formed UTM tags only', async () => {
        await send(base('page_view', {
            referrer: 'https://www.google.com/search?q=business+loan+ravi+9876543210',
            utm: { source: 'google', medium: 'cpc', campaign: 'diwali-2026', term: 'ravi@example.com', content: 'a'.repeat(101), extra: 'x' }
        }));
        const doc = await AnalyticsEvent.findOne({}).lean();
        assert.equal(doc.referrerHost, 'www.google.com');
        assert.deepEqual(doc.utm, { source: 'google', medium: 'cpc', campaign: 'diwali-2026' });
        assert.ok(!JSON.stringify(doc).includes('9876543210'));
    });

    test('a phone number in any UTM field is never stored', async () => {
        const phones = ['9876543210', '98765-43210', '+919876543210', '919876543210', '09876543210', '98765.43210'];
        for (const key of ['source', 'medium', 'campaign', 'term', 'content']) {
            for (const phone of phones) {
                await AnalyticsEvent.deleteMany({});
                // A legitimate tag alongside, which must survive.
                const other = key === 'medium' ? { source: 'google' } : { medium: 'cpc' };
                const res = await send(base('page_view', { utm: { ...other, [key]: phone } }));
                assert.equal(res.status, 202, 'the page view itself is still accepted');
                const doc = await AnalyticsEvent.findOne({}).lean();
                assert.deepEqual(doc.utm, other, `${key}=${phone} dropped, other tag kept`);
                assert.ok(!JSON.stringify(doc).includes('9876543210'), `${key}=${phone} not stored`);
            }
        }
    });

    test('ordinary campaign tags, including short numbers, are still kept', async () => {
        await send(base('page_view', {
            utm: { source: 'newsletter', medium: 'email', campaign: 'diwali-2026', term: '12345', content: 'banner_v2' }
        }));
        const doc = await AnalyticsEvent.findOne({}).lean();
        assert.deepEqual(doc.utm, { source: 'newsletter', medium: 'email', campaign: 'diwali-2026', term: '12345', content: 'banner_v2' });
    });

    test('other events carry no attribution even if sent', async () => {
        await send(base('cta_click', { ctaId: 'hero_apply', referrer: 'https://x.example/', utm: { source: 'x' } }));
        const doc = await AnalyticsEvent.findOne({}).lean();
        assert.equal(doc.referrerHost ?? null, null);
        assert.equal(doc.utm, undefined);
    });

    test('a non-http referrer is ignored', async () => {
        await send(base('page_view', { referrer: 'javascript:alert(1)' }));
        const doc = await AnalyticsEvent.findOne({}).lean();
        assert.equal(doc.referrerHost, null);
    });
});

describe('Bot filtering', () => {
    test('known automated user-agents are accepted but not stored', async () => {
        for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1)', 'curl/8.4.0', 'HeadlessChrome/120', 'python-requests/2.31', 'node']) {
            const res = await send(base('page_view'), { 'User-Agent': ua });
            assert.equal(res.status, 202, ua);
        }
        assert.equal(await AnalyticsEvent.countDocuments(), 0);
    });

    test('helpers classify devices and bots', () => {
        assert.equal(deviceTypeOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'), 'mobile');
        assert.equal(deviceTypeOf('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablet');
        assert.equal(deviceTypeOf('Mozilla/5.0 (Linux; Android 13; SM-X200) Safari'), 'tablet');
        assert.equal(deviceTypeOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'desktop');
        assert.equal(isBot(''), true);
        assert.equal(isBot('Mozilla/5.0 (Windows NT 10.0) Chrome/126'), false);
    });
});

describe('Retention', () => {
    test('events expire through a TTL index', async () => {
        const indexes = await AnalyticsEvent.collection.indexes();
        const ttl = indexes.find((i) => i.name === 'occurredAt_ttl');
        assert.ok(ttl);
        assert.equal(ttl.expireAfterSeconds, 365 * 24 * 60 * 60);
    });
});
