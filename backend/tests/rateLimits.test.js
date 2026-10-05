// Small limits for this file only (it runs in its own process).
process.env.LEAD_RATE_LIMIT_MAX = '3';
process.env.PINCODE_RATE_LIMIT_MAX = '2';
process.env.ANALYTICS_RATE_LIMIT_MAX = '4';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { harness, idempotencyKey, validLead } = require('./helpers');
const pincode = require('../src/services/pincode.service');

before(async () => {
    pincode._setFetch(async () => new Response(JSON.stringify([{ Status: 'Error', PostOffice: null }]), { status: 200 }));
    await harness.start();
});
after(() => harness.stop());

describe('Rate limiting', () => {
    test('lead submissions are capped per IP with a clear message', async () => {
        const statuses = [];
        for (let i = 0; i < 4; i += 1) {
            const res = await harness.call('POST', '/api/leads', { body: validLead(), headers: { 'Idempotency-Key': idempotencyKey() } });
            statuses.push(res.status);
            if (res.status === 429) {
                assert.equal(res.json.success, false);
                assert.match(res.json.message, /try again later/);
                assert.ok(res.headers.get('retry-after'));
            }
        }
        assert.deepEqual(statuses, [201, 201, 201, 429]);
    });

    test('PIN lookups are capped per IP', async () => {
        const statuses = [];
        for (let i = 0; i < 3; i += 1) statuses.push((await harness.call('GET', '/api/pincode/226001')).status);
        assert.deepEqual(statuses, [404, 404, 429]);
    });

    test('analytics events are capped per IP', async () => {
        const statuses = [];
        for (let i = 0; i < 5; i += 1) {
            statuses.push((await harness.call('POST', '/api/analytics/events', {
                body: { name: 'page_view', sessionId: 'abcdef0123456789', path: '/' }
            })).status);
        }
        assert.deepEqual(statuses, [202, 202, 202, 202, 429]);
    });
});
