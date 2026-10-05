// Error logs must never contain a visitor's personal or financial values, even
// when an error message quotes them. Logs are captured from the real logger.
process.env.NODE_ENV = 'test';
process.env.LOG_IN_TESTS = '1';
process.env.MONGODB_URI = 'mongodb://placeholder-not-used';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('../src/config/db');
const Lead = require('../src/models/Lead');
const { errorHandler, safeErrorMeta } = require('../src/middleware/errorHandler');

// Values a visitor would type. None may appear in any log line.
const PHONE = '5876543210';
const OWNER = 'Ravinder Kumar Sharma';
const BUSINESS = 'Sharma Kirana Bhandar';
const PIN = '22600X';
const AMOUNT = '7500000';
const SENSITIVE = [PHONE, OWNER, BUSINESS, PIN, AMOUNT, '9876543210', '226001'];

const captured = [];
for (const level of ['log', 'error', 'warn']) {
    console[level] = (...args) => captured.push(args.join(' '));
}
beforeEach(() => { captured.length = 0; });

const run = (err) => {
    const res = {
        statusCode: 0,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    errorHandler(err, { method: 'POST', baseUrl: '/api', route: { path: '/leads' } }, res, () => {});
    return res;
};

const assertClean = (res) => {
    const logged = captured.join('\n');
    assert.ok(captured.length > 0, 'something was logged');
    for (const v of SENSITIVE) assert.ok(!logged.includes(v), `logged a sensitive value: ${v}`);
    for (const v of SENSITIVE) assert.ok(!JSON.stringify(res.body).includes(v), `returned a sensitive value: ${v}`);
    assert.equal(res.statusCode, 500);
    return JSON.parse(captured[captured.length - 1]);
};

// A real Mongoose ValidationError carrying every kind of form value.
const leadValidationError = () => new Lead({
    reference: 'SFL-TEST0001',
    idempotencyKey: 'k'.repeat(20),
    requestFingerprint: 'a'.repeat(64),
    pinCode: PIN,
    state: 'Uttar Pradesh',
    district: 'Lucknow',
    country: 'India',
    desiredLoanAmount: `${AMOUNT} rupees`,
    useOfFunds: BUSINESS,
    averageMonthlySale: '5L+',
    businessVintage: '5+',
    creditScore: '750+',
    businessName: BUSINESS,
    ownerName: OWNER,
    phoneNumber: PHONE,
    consentAccepted: true,
    consentAcceptedAt: new Date()
}).validateSync();

describe('Error logs contain no personal data', () => {
    test('the raw Mongoose message really does contain the values (the risk being guarded)', () => {
        const err = leadValidationError();
        assert.equal(err.name, 'ValidationError');
        assert.ok(err.message.includes(PHONE));
    });

    test('ValidationError: type and field paths only', () => {
        const entry = assertClean(run(leadValidationError()));
        assert.equal(entry.message, 'Unhandled error');
        assert.equal(entry.meta.error, 'ValidationError');
        assert.equal(entry.meta.route, 'POST /api/leads');
        assert.deepEqual(Object.keys(entry.meta.fields).sort(), ['desiredLoanAmount', 'phoneNumber', 'pinCode', 'useOfFunds']);
        assert.equal(entry.meta.fields.phoneNumber, 'regexp');
        assert.equal(entry.meta.fields.useOfFunds, 'enum');
        assert.equal(entry.meta.message, undefined);
    });

    test('CastError: path and target type only', () => {
        const err = new mongoose.Error.CastError('Number', `${OWNER} ${PHONE}`, 'desiredLoanAmount');
        assert.ok(err.message.includes(PHONE));
        const entry = assertClean(run(err));
        assert.equal(entry.meta.error, 'CastError');
        assert.equal(entry.meta.path, 'desiredLoanAmount');
        assert.equal(entry.meta.kind, 'Number');
        assert.equal(entry.meta.message, undefined);
    });

    test('duplicate-key error: key names only, never keyValue or message', () => {
        const err = Object.assign(new Error(`E11000 duplicate key error dup key: { phoneNumber: "${PHONE}" }`), {
            name: 'MongoServerError', code: 11000, codeName: 'DuplicateKey',
            keyPattern: { phoneNumber: 1 }, keyValue: { phoneNumber: PHONE }
        });
        const entry = assertClean(run(err));
        assert.deepEqual(entry.meta.keys, ['phoneNumber']);
        assert.equal(entry.meta.code, 11000);
        assert.equal(entry.meta.keyValue, undefined);
    });

    test('a generic error keeps its message but masks long numbers', () => {
        const entry = assertClean(run(new TypeError(`unexpected value ${PHONE} for pin 226001 amount ${AMOUNT}`)));
        assert.equal(entry.meta.error, 'TypeError');
        assert.equal(entry.meta.message, 'unexpected value [number] for pin [number] amount [number]');
    });

    test('safeErrorMeta never copies a request body', () => {
        const meta = safeErrorMeta(Object.assign(new Error('x'), { body: { phoneNumber: PHONE }, ownerName: OWNER }));
        assert.ok(!JSON.stringify(meta).includes(PHONE));
        assert.ok(!JSON.stringify(meta).includes(OWNER));
    });
});
