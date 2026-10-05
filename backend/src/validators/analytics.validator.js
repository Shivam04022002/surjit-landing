const {
    EVENT_NAMES, PAGE_PATHS, CTA_IDS, NAV_TARGETS, FORM_FIELDS, FAILURE_REASONS, FORM_STEPS,
    FAQ_ID_PATTERN, UTM_KEYS, UTM_MAX_LENGTH, UTM_PATTERN, isPhoneLike
} = require('../constants/analytics');

// Validates one analytics event from the browser and reduces it to the
// allowlisted fields. Returns { value, errors }.
//
// Each event name accepts only the detail field that belongs to it; any other
// property in the body is ignored, so form values sent by mistake are dropped
// rather than stored.

const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;

// Which detail each event requires.
const DETAIL_RULES = {
    form_step_viewed: { step: true },
    form_step_completed: { step: true },
    validation_error: { step: true, field: true },
    form_submit_failed: { reason: true },
    cta_click: { ctaId: true },
    nav_click: { navTarget: true },
    faq_open: { faqId: true }
};

// Events that may carry referrer and campaign attribution.
const ATTRIBUTION_EVENTS = new Set(['page_view', 'session_start']);

const cleanUtm = (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const utm = {};
    for (const key of UTM_KEYS) {
        const v = raw[key];
        if (typeof v !== 'string') continue;
        const t = v.trim();
        // A malformed or phone-like tag is dropped, not rejected: attribution is
        // best effort and must never cost the page view itself.
        if (t && t.length <= UTM_MAX_LENGTH && UTM_PATTERN.test(t) && !isPhoneLike(t)) utm[key] = t;
    }
    return Object.keys(utm).length ? utm : undefined;
};

// Host only, lower-cased. A full referrer URL can carry another site's query
// string, which is more than analytics needs.
const referrerHostOf = (raw) => {
    if (typeof raw !== 'string' || !raw) return null;
    try {
        const url = new URL(raw);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.hostname.toLowerCase().slice(0, 200) || null;
    } catch {
        return null;
    }
};

const validateEvent = (body) => {
    const errors = [];
    const fail = (field, message) => errors.push({ field, message });
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const value = {};

    if (!EVENT_NAMES.includes(input.name)) fail('name', 'Unknown event');
    else value.name = input.name;

    if (typeof input.sessionId !== 'string' || !SESSION_ID.test(input.sessionId)) fail('sessionId', 'Invalid session id');
    else value.sessionId = input.sessionId;

    if (!PAGE_PATHS.includes(input.path)) fail('path', 'Unknown page path');
    else value.path = input.path;

    const rules = DETAIL_RULES[value.name] || {};

    if (rules.step) {
        if (!FORM_STEPS.includes(input.step)) fail('step', 'Invalid form step');
        else value.step = input.step;
    }
    if (rules.field) {
        if (!FORM_FIELDS.includes(input.field)) fail('field', 'Unknown form field');
        else value.field = input.field;
    }
    if (rules.reason) {
        if (!FAILURE_REASONS.includes(input.reason)) fail('reason', 'Unknown failure reason');
        else value.reason = input.reason;
    }
    if (rules.ctaId) {
        if (!CTA_IDS.includes(input.ctaId)) fail('ctaId', 'Unknown CTA');
        else value.ctaId = input.ctaId;
    }
    if (rules.navTarget) {
        if (!NAV_TARGETS.includes(input.navTarget)) fail('navTarget', 'Unknown navigation target');
        else value.navTarget = input.navTarget;
    }
    if (rules.faqId) {
        if (typeof input.faqId !== 'string' || !FAQ_ID_PATTERN.test(input.faqId)) fail('faqId', 'Invalid FAQ id');
        else value.faqId = input.faqId;
    }

    if (ATTRIBUTION_EVENTS.has(value.name)) {
        value.referrerHost = referrerHostOf(input.referrer);
        const utm = cleanUtm(input.utm);
        if (utm) value.utm = utm;
    }

    return { value, errors };
};

module.exports = { validateEvent, cleanUtm, referrerHostOf };
