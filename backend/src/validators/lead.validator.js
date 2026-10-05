const {
    USE_OF_FUNDS, AVERAGE_MONTHLY_SALE, BUSINESS_VINTAGE, CREDIT_SCORE, NAME_MAX_LENGTH
} = require('../constants/leadOptions');

// Server-side validation of a lead enquiry, independent of the browser's.
//
// Only the fields listed here are read; anything else in the body is ignored,
// so a crafted request cannot set status, reference or timestamps.
//
// Returns { value, errors }. `value` is the normalised lead, and is only
// meaningful when `errors` is empty.

const PIN_CODE = /^[1-9][0-9]{5}$/;
const INDIAN_MOBILE = /^[6-9][0-9]{9}$/;
// Place names: letters in any script, spaces and common punctuation.
const PLACE_NAME = /^[\p{L}\p{M} .'&()-]+$/u;
// A person's name: letters in any script, spaces, dot, apostrophe, hyphen.
const PERSON_NAME = /^[\p{L}\p{M} .'-]+$/u;
// A business name may hold digits and punctuation, but no control characters
// or angle brackets.
const BUSINESS_NAME = /^[^\p{Cc}<>]+$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{16,64}$/;

const PLACE_MAX_LENGTH = 100;

// Trims and collapses runs of whitespace, so "  Ram   Kumar " becomes
// "Ram Kumar" and a value of only spaces becomes empty.
const cleanText = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

const validateLead = (body, { minAmount, maxAmount }) => {
    const errors = [];
    const fail = (field, message) => errors.push({ field, message });
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const value = {};

    // ── Step 1: location ──
    const pinCode = typeof input.pinCode === 'string' || typeof input.pinCode === 'number'
        ? String(input.pinCode).trim() : '';
    if (!pinCode) fail('pinCode', 'PIN code is required');
    else if (!PIN_CODE.test(pinCode)) fail('pinCode', 'PIN code must be a valid 6-digit number');
    else value.pinCode = pinCode;

    for (const [field, label] of [['state', 'State'], ['district', 'District'], ['country', 'Country']]) {
        const text = cleanText(input[field]);
        if (!text) fail(field, `${label} is required`);
        else if (text.length > PLACE_MAX_LENGTH) fail(field, `${label} must be at most ${PLACE_MAX_LENGTH} characters`);
        else if (!PLACE_NAME.test(text)) fail(field, `${label} contains invalid characters`);
        else value[field] = text;
    }

    // ── Step 2: loan details ──
    // A JSON number, or a string of digits (some clients send numbers as
    // strings). Whole rupees only.
    const rawAmount = input.desiredLoanAmount;
    const amount = typeof rawAmount === 'number'
        ? rawAmount
        : (typeof rawAmount === 'string' && /^\d+$/.test(rawAmount.trim()) ? Number(rawAmount.trim()) : NaN);
    if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
        fail('desiredLoanAmount', 'Loan amount is required');
    } else if (!Number.isInteger(amount)) {
        fail('desiredLoanAmount', 'Loan amount must be a whole number of rupees');
    } else if (amount < minAmount) {
        fail('desiredLoanAmount', `Minimum loan amount is ₹${minAmount.toLocaleString('en-IN')}`);
    } else if (amount > maxAmount) {
        fail('desiredLoanAmount', `Maximum loan amount is ₹${maxAmount.toLocaleString('en-IN')}`);
    } else {
        value.desiredLoanAmount = amount;
    }

    // ── Steps 2–3: option fields ──
    const options = [
        ['useOfFunds', USE_OF_FUNDS, 'Use of funds'],
        ['averageMonthlySale', AVERAGE_MONTHLY_SALE, 'Average monthly sale'],
        ['businessVintage', BUSINESS_VINTAGE, 'Business vintage'],
        ['creditScore', CREDIT_SCORE, 'Estimated credit score']
    ];
    for (const [field, allowed, label] of options) {
        const v = typeof input[field] === 'string' ? input[field].trim() : '';
        if (!v) fail(field, `${label} is required`);
        else if (!Object.prototype.hasOwnProperty.call(allowed, v)) fail(field, `${label} is not a valid option`);
        else value[field] = v;
    }

    // ── Step 4: business info ──
    const businessName = cleanText(input.businessName);
    if (!businessName) fail('businessName', 'Business name is required');
    else if (businessName.length > NAME_MAX_LENGTH) fail('businessName', `Business name must be at most ${NAME_MAX_LENGTH} characters`);
    else if (!BUSINESS_NAME.test(businessName)) fail('businessName', 'Business name contains invalid characters');
    else value.businessName = businessName;

    const ownerName = cleanText(input.ownerName);
    if (!ownerName) fail('ownerName', 'Owner name is required');
    else if (ownerName.length > NAME_MAX_LENGTH) fail('ownerName', `Owner name must be at most ${NAME_MAX_LENGTH} characters`);
    else if (!PERSON_NAME.test(ownerName)) fail('ownerName', 'Owner name may only contain letters, spaces, dots, apostrophes and hyphens');
    else value.ownerName = ownerName;

    // Ten digits. Spaces and hyphens are tolerated and removed; a country code
    // is not — the form shows +91 as a prefix and never submits it.
    const phone = typeof input.phoneNumber === 'string' ? input.phoneNumber.replace(/[\s-]/g, '') : '';
    if (!phone) fail('phoneNumber', 'Phone number is required');
    else if (!INDIAN_MOBILE.test(phone)) fail('phoneNumber', 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9');
    else value.phoneNumber = phone;

    if (input.consentAccepted !== true && input.consentAccepted !== 'true') {
        fail('consentAccepted', 'Please accept the privacy notice to submit your enquiry');
    } else {
        value.consentAccepted = true;
    }

    return { value, errors };
};

const isValidIdempotencyKey = (key) => typeof key === 'string' && IDEMPOTENCY_KEY.test(key);

module.exports = { validateLead, isValidIdempotencyKey, PIN_CODE };
