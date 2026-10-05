const env = require('../config/env');
const leadService = require('../services/lead.service');
const { validateLead, isValidIdempotencyKey } = require('../validators/lead.validator');
const { sendSuccess, sendError } = require('../utils/response');

// POST /api/leads
//
// Header  Idempotency-Key: <16–64 chars, A-Z a-z 0-9 ->  (one per submission attempt)
// Body    the twelve form fields plus consentAccepted
//
// 201 { reference }  lead saved
// 200 { reference }  this key was already used with the same details; the
//                    original lead is returned and nothing new is created
// 400                missing or malformed Idempotency-Key
// 409                this key was already used with different details
// 422                field validation failed — errors[] names each field
const createLead = async (req, res) => {
    const key = req.get('Idempotency-Key');
    if (!isValidIdempotencyKey(key)) {
        return sendError(res, 400, 'A valid Idempotency-Key header is required', [
            { field: 'Idempotency-Key', message: 'Missing or malformed' }
        ]);
    }

    const { value, errors } = validateLead(req.body, {
        minAmount: env.LOAN_MIN_AMOUNT,
        maxAmount: env.LOAN_MAX_AMOUNT
    });
    if (errors.length) {
        return sendError(res, 422, 'Please correct the highlighted fields', errors);
    }

    const { reference, replayed } = await leadService.createLead(value, key);
    return sendSuccess(
        res,
        replayed ? 200 : 201,
        'Thank you. Your enquiry has been received.',
        { reference }
    );
};

// GET /api/leads/config — the bounds the form validates against, so the
// browser and the API cannot disagree about them.
const getConfig = (req, res) => sendSuccess(res, 200, 'OK', {
    loanAmount: { min: env.LOAN_MIN_AMOUNT, max: env.LOAN_MAX_AMOUNT }
});

module.exports = { createLead, getConfig };
