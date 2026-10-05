const mongoose = require('mongoose');
const {
    USE_OF_FUNDS, AVERAGE_MONTHLY_SALE, BUSINESS_VINTAGE, CREDIT_SCORE, NAME_MAX_LENGTH
} = require('../constants/leadOptions');

// One business loan enquiry from the landing page.
//
// This is the business record of an enquiry. It is deliberately not linked to
// the anonymous analytics session that produced it: no session id, referrer or
// campaign data is stored here.
//
// Retention: no automatic expiry. How long enquiries are kept is a business and
// legal decision (see README "Data retention") and is not decided in code.
const leadSchema = new mongoose.Schema({
    // Public reference shown to the visitor. The Mongo _id is never returned.
    reference: { type: String, required: true, unique: true },

    pinCode: { type: String, required: true, match: /^[1-9][0-9]{5}$/ },
    state: { type: String, required: true, trim: true, maxlength: 100 },
    district: { type: String, required: true, trim: true, maxlength: 100 },
    country: { type: String, required: true, trim: true, maxlength: 100 },

    desiredLoanAmount: { type: Number, required: true, min: 1 },
    useOfFunds: { type: String, required: true, enum: Object.keys(USE_OF_FUNDS) },

    averageMonthlySale: { type: String, required: true, enum: Object.keys(AVERAGE_MONTHLY_SALE) },
    businessVintage: { type: String, required: true, enum: Object.keys(BUSINESS_VINTAGE) },
    creditScore: { type: String, required: true, enum: Object.keys(CREDIT_SCORE) },

    businessName: { type: String, required: true, trim: true, maxlength: NAME_MAX_LENGTH },
    ownerName: { type: String, required: true, trim: true, maxlength: NAME_MAX_LENGTH },
    // Ten digits, no country code.
    phoneNumber: { type: String, required: true, match: /^[6-9][0-9]{9}$/ },

    consentAccepted: { type: Boolean, required: true, validate: (v) => v === true },
    consentAcceptedAt: { type: Date, required: true },

    // Client-generated key for one submission attempt. A retried request with
    // the same key and the same details returns the original lead instead of
    // creating another; the same key with different details is refused (409).
    idempotencyKey: { type: String, required: true, unique: true },
    // SHA-256 of the normalised submitted details (lead.service#fingerprint),
    // used only to compare a retry with the original. A digest, not a copy:
    // no second copy of the details is kept for idempotency.
    requestFingerprint: { type: String, required: true, match: /^[a-f0-9]{64}$/ },

    status: { type: String, enum: ['new'], default: 'new' }
}, {
    timestamps: true
});

// Newest-first listing for whoever follows up on enquiries.
leadSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Lead', leadSchema);
