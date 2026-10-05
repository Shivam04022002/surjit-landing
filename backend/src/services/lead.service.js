const crypto = require('crypto');
const Lead = require('../models/Lead');
const AppError = require('../utils/AppError');

// Unambiguous characters for references a visitor may read out over the phone
// (no 0/O, 1/I/L).
const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const REFERENCE_LENGTH = 8;

const newReference = () => {
    const bytes = crypto.randomBytes(REFERENCE_LENGTH);
    let out = '';
    for (const b of bytes) out += REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length];
    return `SFL-${out}`;
};

// A digest of the normalised details (the validator's output), with keys in a
// fixed order, so the same details always give the same value — including
// when a retry differs only in whitespace or number formatting the validator
// already normalised away.
const fingerprint = (lead) => {
    const canonical = JSON.stringify(Object.keys(lead).sort().map((k) => [k, lead[k]]));
    return crypto.createHash('sha256').update(canonical).digest('hex');
};

const isDuplicateKey = (err, field) =>
    err && err.code === 11000 && (!field || Object.prototype.hasOwnProperty.call(err.keyPattern || {}, field));

// The answer for a key that already has a lead: the original result when the
// details match, otherwise a conflict. The conflict says nothing about the
// original lead beyond the fact that the key is taken.
const replay = (existing, requestFingerprint) => {
    if (existing.requestFingerprint !== requestFingerprint) {
        throw new AppError(
            'This submission was already received with different details. Please refresh the page and submit your enquiry again.',
            409,
            [{ field: 'Idempotency-Key', message: 'Already used for a different submission' }]
        );
    }
    return { reference: existing.reference, replayed: true };
};

// Creates the lead, or — when this idempotency key was already used — returns
// the original result (same details) or refuses with 409 (different details).
//
// The first lookup handles the common case (a retry after a lost response);
// the unique index on idempotencyKey handles requests racing each other, and
// the winner's fingerprint decides every loser's answer the same way.
const createLead = async (lead, idempotencyKey) => {
    const requestFingerprint = fingerprint(lead);

    const existing = await Lead.findOne({ idempotencyKey }).select('reference requestFingerprint').lean();
    if (existing) return replay(existing, requestFingerprint);

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const doc = await Lead.create({
                ...lead,
                reference: newReference(),
                idempotencyKey,
                requestFingerprint,
                consentAcceptedAt: new Date()
            });
            return { reference: doc.reference, replayed: false };
        } catch (err) {
            if (isDuplicateKey(err, 'idempotencyKey')) {
                const winner = await Lead.findOne({ idempotencyKey }).select('reference requestFingerprint').lean();
                if (winner) return replay(winner, requestFingerprint);
            }
            // A reference collision is astronomically unlikely; try a new one.
            if (isDuplicateKey(err, 'reference')) continue;
            throw err;
        }
    }
    throw new Error('Could not allocate a lead reference');
};

module.exports = { createLead, newReference, fingerprint };
