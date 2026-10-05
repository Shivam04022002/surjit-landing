// What the anonymous analytics beacon accepts. Everything is an allowlist:
// an unknown event, path, CTA, step or field is rejected, so the collection can
// only ever hold the shapes below — and none of them can carry a form value.
//
// The frontend mirrors these in src/services/analytics.js.

const EVENT_NAMES = [
    'page_view',
    'session_start',
    'form_start',
    'form_step_viewed',
    'form_step_completed',
    'validation_error',
    'form_submit_attempted',
    // Fired by the browser only after the API has confirmed the lead was
    // saved. The lead itself (not this event) is the business record.
    'form_submit_succeeded',
    'form_submit_failed',
    'cta_click',
    'nav_click',
    'faq_open'
];

// The landing page is a single route.
const PAGE_PATHS = ['/'];

// Identifies which call-to-action was pressed — never its text or target URL.
const CTA_IDS = ['nav_apply', 'hero_apply', 'final_apply', 'mobile_nav_apply', 'success_restart'];

// In-page navigation targets.
const NAV_TARGETS = ['home', 'benefits', 'apply', 'how-it-works', 'faq'];

// The form's field names, for validation_error. Only the name of the field
// that failed is recorded, never what was typed into it.
const FORM_FIELDS = [
    'pinCode', 'state', 'district', 'country',
    'desiredLoanAmount', 'useOfFunds',
    'averageMonthlySale', 'businessVintage', 'creditScore',
    'businessName', 'ownerName', 'phoneNumber', 'consentAccepted'
];

// Coarse reason a submission failed, from the HTTP outcome.
const FAILURE_REASONS = ['validation', 'rate_limited', 'server', 'network'];

const FORM_STEPS = [1, 2, 3, 4];

const FAQ_ID_PATTERN = /^[a-z0-9-]{1,40}$/;

const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'];
const UTM_MAX_LENGTH = 100;
// Campaign tags are short identifiers. Anything outside this set (spaces,
// @, slashes) is dropped rather than stored, which also keeps an email address
// or phone number pasted into a tag from landing in the collection.
const UTM_PATTERN = /^[A-Za-z0-9._\-+]+$/;

// A tag that is really a phone number — someone pasting their mobile into a
// campaign link, or a link built from a lead — is dropped. Matches any ten
// digits, and an Indian mobile with a 91 or 0 prefix, once common separators
// are removed: 9876543210, 98765-43210, +919876543210, 09876543210.
const PHONE_LIKE = /^(?:\d{10}|(?:91|0)[6-9]\d{9})$/;
const isPhoneLike = (value) => PHONE_LIKE.test(String(value).replace(/[\s.\-_+()]/g, ''));

const DEVICE_TYPES = ['mobile', 'tablet', 'desktop', 'unknown'];

module.exports = {
    EVENT_NAMES,
    PAGE_PATHS,
    CTA_IDS,
    NAV_TARGETS,
    FORM_FIELDS,
    FAILURE_REASONS,
    FORM_STEPS,
    FAQ_ID_PATTERN,
    UTM_KEYS,
    UTM_MAX_LENGTH,
    UTM_PATTERN,
    isPhoneLike,
    DEVICE_TYPES
};
