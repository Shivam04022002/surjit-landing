const mongoose = require('mongoose');
const env = require('../config/env');
const {
    EVENT_NAMES, PAGE_PATHS, CTA_IDS, NAV_TARGETS, FORM_FIELDS, FAILURE_REASONS, FORM_STEPS, DEVICE_TYPES
} = require('../constants/analytics');

// One anonymous first-party analytics event from the landing page.
//
// What is never stored: IP address, raw user-agent, full URLs, query strings,
// or anything a visitor typed into the form. `sessionId` is a random value the
// browser generates for itself (30-minute inactivity expiry) and is not linked
// to any lead.
const utmSchema = new mongoose.Schema({
    source: String,
    medium: String,
    campaign: String,
    term: String,
    content: String
}, { _id: false });

const analyticsEventSchema = new mongoose.Schema({
    name: { type: String, required: true, enum: EVENT_NAMES },
    sessionId: { type: String, required: true, maxlength: 64 },
    path: { type: String, required: true, enum: PAGE_PATHS },

    // Event-specific detail. Each is an allowlisted identifier, never free text.
    step: { type: Number, enum: [...FORM_STEPS, null], default: null },
    field: { type: String, enum: [...FORM_FIELDS, null], default: null },
    ctaId: { type: String, enum: [...CTA_IDS, null], default: null },
    navTarget: { type: String, enum: [...NAV_TARGETS, null], default: null },
    faqId: { type: String, maxlength: 40, default: null },
    reason: { type: String, enum: [...FAILURE_REASONS, null], default: null },

    // Attribution, recorded on page_view and session_start only.
    referrerHost: { type: String, maxlength: 200, default: null },
    utm: { type: utmSchema, default: undefined },

    deviceType: { type: String, enum: DEVICE_TYPES, default: 'unknown' },

    // Server time; a client clock is never trusted.
    occurredAt: { type: Date, default: Date.now }
}, {
    timestamps: false,
    versionKey: false
});

// Range queries for reporting, and automatic expiry after the retention period.
analyticsEventSchema.index(
    { occurredAt: 1 },
    { expireAfterSeconds: env.ANALYTICS_RETENTION_DAYS * 24 * 60 * 60, name: 'occurredAt_ttl' }
);
// Per-event counts and funnels within a range.
analyticsEventSchema.index({ name: 1, occurredAt: -1 });
// Distinct sessions within a range.
analyticsEventSchema.index({ sessionId: 1, occurredAt: -1 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
