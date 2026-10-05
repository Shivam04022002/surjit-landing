// Rate limiting has its own suite; lift the cap so validation cases are not throttled.
process.env.LEAD_RATE_LIMIT_MAX = '1000';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { harness, idempotencyKey, validLead } = require('./helpers');
const Lead = require('../src/models/Lead');
const AnalyticsEvent = require('../src/models/AnalyticsEvent');
const db = require('../src/config/db');

const submit = (body, key = idempotencyKey()) =>
    harness.call('POST', '/api/leads', { body, headers: { 'Idempotency-Key': key } });

const fieldsIn = (res) => (res.json?.errors || []).map((e) => e.field);

before(() => harness.start());
after(() => harness.stop());
beforeEach(() => Lead.deleteMany({}));

describe('Valid lead creation', () => {
    test('saves the lead and returns only a public reference', async () => {
        const res = await submit(validLead());
        assert.equal(res.status, 201);
        assert.equal(res.json.success, true);
        assert.match(res.json.data.reference, /^SFL-[A-Z2-9]{8}$/);
        assert.deepEqual(Object.keys(res.json.data), ['reference'], 'no internal id or lead data echoed');

        const saved = await Lead.findOne({ reference: res.json.data.reference }).lean();
        assert.equal(saved.phoneNumber, '9876543210');
        assert.equal(saved.desiredLoanAmount, 250000);
        assert.equal(saved.consentAccepted, true);
        assert.ok(saved.consentAcceptedAt instanceof Date);
        assert.equal(saved.status, 'new');
    });

    test('normalises whitespace and accepts a numeric-string amount', async () => {
        const res = await submit(validLead({
            ownerName: '  Ravi    Sharma ', businessName: ' Sharma  Traders ', state: ' Uttar  Pradesh ',
            desiredLoanAmount: '300000', phoneNumber: '98765 43210'
        }));
        assert.equal(res.status, 201);
        const saved = await Lead.findOne({}).lean();
        assert.equal(saved.ownerName, 'Ravi Sharma');
        assert.equal(saved.businessName, 'Sharma Traders');
        assert.equal(saved.state, 'Uttar Pradesh');
        assert.equal(saved.desiredLoanAmount, 300000);
        assert.equal(saved.phoneNumber, '9876543210');
    });

    test('ignores fields a visitor may not set', async () => {
        const res = await submit(validLead({ status: 'approved', reference: 'SFL-HACKED00', _id: '64b000000000000000000000' }));
        assert.equal(res.status, 201);
        const saved = await Lead.findOne({}).lean();
        assert.equal(saved.status, 'new');
        assert.notEqual(saved.reference, 'SFL-HACKED00');
        assert.notEqual(String(saved._id), '64b000000000000000000000');
    });

    test('a lead creates no analytics record', async () => {
        await AnalyticsEvent.deleteMany({});
        await submit(validLead());
        assert.equal(await AnalyticsEvent.countDocuments(), 0);
    });
});

describe('Missing and malformed fields', () => {
    test('an empty body reports every required field', async () => {
        const res = await submit({});
        assert.equal(res.status, 422);
        assert.equal(res.json.success, false);
        for (const f of ['pinCode', 'state', 'district', 'country', 'desiredLoanAmount', 'useOfFunds',
            'averageMonthlySale', 'businessVintage', 'creditScore', 'businessName', 'ownerName', 'phoneNumber',
            'consentAccepted']) {
            assert.ok(fieldsIn(res).includes(f), `${f} reported`);
        }
        assert.equal(await Lead.countDocuments(), 0);
    });

    test('invalid PIN codes are rejected', async () => {
        for (const pinCode of ['12345', '1234567', '012345', '22600a', '']) {
            const res = await submit(validLead({ pinCode }));
            assert.equal(res.status, 422, `PIN ${pinCode}`);
            assert.deepEqual(fieldsIn(res), ['pinCode']);
        }
    });

    test('invalid phone numbers are rejected', async () => {
        for (const phoneNumber of ['5876543210', '987654321', '98765432100', '+919876543210', '98765abcde', '']) {
            const res = await submit(validLead({ phoneNumber }));
            assert.equal(res.status, 422, `phone ${phoneNumber}`);
            assert.deepEqual(fieldsIn(res), ['phoneNumber']);
        }
    });

    test('loan amount below minimum, above maximum or not whole is rejected', async () => {
        for (const desiredLoanAmount of [9999, 5000001, 15000.5, -1, 'ten thousand', '1e6', null]) {
            const res = await submit(validLead({ desiredLoanAmount }));
            assert.equal(res.status, 422, `amount ${desiredLoanAmount}`);
            assert.deepEqual(fieldsIn(res), ['desiredLoanAmount']);
        }
        assert.equal((await submit(validLead({ desiredLoanAmount: 10000 }))).status, 201, 'minimum is inclusive');
        assert.equal((await submit(validLead({ desiredLoanAmount: 5000000 }))).status, 201, 'maximum is inclusive');
    });

    test('options outside the allowed values are rejected', async () => {
        const res = await submit(validLead({
            useOfFunds: 'gambling', averageMonthlySale: '10L+', businessVintage: '10+', creditScore: '900'
        }));
        assert.equal(res.status, 422);
        assert.deepEqual(fieldsIn(res).sort(), ['averageMonthlySale', 'businessVintage', 'creditScore', 'useOfFunds']);
    });

    test('blank-only and over-long names are rejected', async () => {
        let res = await submit(validLead({ ownerName: '     ', businessName: '\t\n' }));
        assert.deepEqual(fieldsIn(res).sort(), ['businessName', 'ownerName']);
        res = await submit(validLead({ ownerName: 'a'.repeat(101), businessName: 'b'.repeat(101) }));
        assert.deepEqual(fieldsIn(res).sort(), ['businessName', 'ownerName']);
        res = await submit(validLead({ ownerName: 'a'.repeat(100), businessName: 'b'.repeat(100) }));
        assert.equal(res.status, 201, '100 characters is allowed');
    });

    test('markup and digits in an owner name are rejected', async () => {
        const res = await submit(validLead({ ownerName: '<script>x</script>', businessName: '<b>Shop</b>' }));
        assert.deepEqual(fieldsIn(res).sort(), ['businessName', 'ownerName']);
        assert.equal((await submit(validLead({ ownerName: 'Ravi 2' }))).status, 422);
    });

    test('consent must be explicitly true', async () => {
        for (const consentAccepted of [false, 'yes', 1, undefined]) {
            const res = await submit(validLead({ consentAccepted }));
            assert.equal(res.status, 422);
            assert.deepEqual(fieldsIn(res), ['consentAccepted']);
        }
    });

    test('a missing or malformed Idempotency-Key is refused', async () => {
        let res = await harness.call('POST', '/api/leads', { body: validLead() });
        assert.equal(res.status, 400);
        res = await submit(validLead(), 'short');
        assert.equal(res.status, 400);
        res = await submit(validLead(), 'has spaces in it but long enough');
        assert.equal(res.status, 400);
        assert.equal(await Lead.countDocuments(), 0);
    });
});

describe('Safe error responses', () => {
    test('malformed JSON is a 400 with no internals', async () => {
        const res = await harness.call('POST', '/api/leads', {
            rawBody: '{"pinCode": ', headers: { 'Idempotency-Key': idempotencyKey() }
        });
        assert.equal(res.status, 400);
        assert.equal(res.json.success, false);
        assert.doesNotMatch(res.text, /SyntaxError|at .*\.js|node_modules/);
    });

    test('an oversized body is a 413', async () => {
        const res = await submit(validLead({ businessName: 'x'.repeat(20000) }));
        assert.equal(res.status, 413);
        assert.doesNotMatch(res.text, /PayloadTooLargeError|stack/);
    });

    test('an array body is rejected as validation, not a crash', async () => {
        const res = await harness.call('POST', '/api/leads', { body: [validLead()], headers: { 'Idempotency-Key': idempotencyKey() } });
        assert.equal(res.status, 422);
    });

    test('unknown routes are a JSON 404', async () => {
        const res = await harness.call('GET', '/api/nope');
        assert.equal(res.status, 404);
        assert.equal(res.json.success, false);
    });

    test('responses carry security headers and no x-powered-by', async () => {
        const res = await harness.call('GET', '/api/leads/config');
        assert.equal(res.headers.get('x-powered-by'), null);
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.ok(res.headers.get('content-security-policy'));
    });

    test('CORS headers are sent only for allowed origins', async () => {
        let res = await harness.call('GET', '/api/leads/config', { headers: { Origin: 'https://landing.example' } });
        assert.equal(res.headers.get('access-control-allow-origin'), 'https://landing.example');
        res = await harness.call('GET', '/api/leads/config', { headers: { Origin: 'https://evil.example' } });
        assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
});

describe('Duplicate submissions', () => {
    test('retrying with the same key returns the original lead, not a second one', async () => {
        const key = idempotencyKey();
        const first = await submit(validLead(), key);
        const second = await submit(validLead(), key);
        assert.equal(first.status, 201);
        assert.equal(second.status, 200);
        assert.equal(second.json.data.reference, first.json.data.reference);
        assert.equal(await Lead.countDocuments(), 1);
    });

    test('simultaneous identical requests create exactly one lead', async () => {
        const key = idempotencyKey();
        const results = await Promise.all(Array.from({ length: 5 }, () => submit(validLead(), key)));
        const refs = new Set(results.map((r) => r.json.data.reference));
        assert.equal(refs.size, 1);
        assert.ok(results.every((r) => r.status === 200 || r.status === 201));
        assert.equal(await Lead.countDocuments(), 1);
    });

    test('a new key is a new enquiry', async () => {
        await submit(validLead());
        await submit(validLead());
        assert.equal(await Lead.countDocuments(), 2);
    });

    test('the same key with only formatting differences is the same request', async () => {
        const key = idempotencyKey();
        const first = await submit(validLead(), key);
        const second = await submit(validLead({
            ownerName: '  Ravi   Sharma ', desiredLoanAmount: '250000', phoneNumber: '98765 43210'
        }), key);
        assert.equal(second.status, 200);
        assert.equal(second.json.data.reference, first.json.data.reference);
        assert.equal(await Lead.countDocuments(), 1);
    });

    test('the same key with different details is refused with 409 and changes nothing', async () => {
        const key = idempotencyKey();
        const first = await submit(validLead(), key);
        assert.equal(first.status, 201);

        for (const change of [{ phoneNumber: '9123456780' }, { desiredLoanAmount: 300000 }, { businessName: 'Other Traders' }]) {
            const res = await submit(validLead(change), key);
            assert.equal(res.status, 409, JSON.stringify(change));
            assert.equal(res.json.success, false);
            assert.equal(res.json.data, undefined, 'no reference or lead data returned');
            assert.ok(!res.text.includes(first.json.data.reference), 'original reference not disclosed');
            assert.ok(!res.text.includes('9876543210'), 'original details not disclosed');
        }

        assert.equal(await Lead.countDocuments(), 1);
        const saved = await Lead.findOne({}).lean();
        assert.equal(saved.phoneNumber, '9876543210', 'original lead untouched');
        assert.equal(saved.desiredLoanAmount, 250000);

        // The original details still replay successfully afterwards.
        const again = await submit(validLead(), key);
        assert.equal(again.status, 200);
        assert.equal(again.json.data.reference, first.json.data.reference);
    });

    test('concurrent requests on one key with mixed details: one lead, and every answer is consistent with it', async () => {
        const key = idempotencyKey();
        const same = () => validLead();
        const different = () => validLead({ businessName: 'Racing Different Traders' });
        const results = await Promise.all([same(), different(), same(), different(), same()].map((b) => submit(b, key)));

        assert.equal(await Lead.countDocuments(), 1);
        const winner = await Lead.findOne({}).lean();
        const winnerIsSame = winner.businessName === 'Sharma Traders';

        results.forEach((r, i) => {
            const sentSame = i % 2 === 0;
            if (sentSame === winnerIsSame) {
                assert.ok(r.status === 200 || r.status === 201, `request ${i}: ${r.status}`);
                assert.equal(r.json.data.reference, winner.reference);
            } else {
                assert.equal(r.status, 409, `request ${i}`);
            }
        });
        assert.equal(results.filter((r) => r.status === 201).length, 1, 'exactly one request created the lead');
    });

    test('only a SHA-256 fingerprint is stored for idempotency, not a second copy of the details', async () => {
        await submit(validLead());
        const raw = await mongoose.connection.db.collection('leads').findOne({});
        assert.match(raw.requestFingerprint, /^[a-f0-9]{64}$/);
        assert.ok(!raw.requestFingerprint.includes('9876543210'));
        const expected = ['_id', 'reference', 'pinCode', 'state', 'district', 'country', 'desiredLoanAmount', 'useOfFunds',
            'averageMonthlySale', 'businessVintage', 'creditScore', 'businessName', 'ownerName', 'phoneNumber',
            'consentAccepted', 'consentAcceptedAt', 'idempotencyKey', 'requestFingerprint', 'status',
            'createdAt', 'updatedAt', '__v'];
        assert.deepEqual(Object.keys(raw).filter((k) => !expected.includes(k)), [], 'no payload copy or extra fields');
    });
});

describe('Config', () => {
    test('exposes the loan bounds the API enforces', async () => {
        const res = await harness.call('GET', '/api/leads/config');
        assert.deepEqual(res.json.data.loanAmount, { min: 10000, max: 5000000 });
    });
});

// Last: this drops the connection.
describe('Database failure', () => {
    test('a lead submitted while the database is down gets a 503 with a safe message', async () => {
        const uri = harness.mongo.getUri('surjit_landing_test');
        await mongoose.disconnect();
        try {
            const res = await submit(validLead());
            assert.equal(res.status, 503);
            assert.equal(res.json.success, false);
            assert.doesNotMatch(res.text, /mongo|MongooseError|127\.0\.0\.1|stack/i);

            const health = await harness.call('GET', '/api/health');
            assert.equal(health.status, 503);
        } finally {
            await db.connect(uri);
        }
        assert.equal((await submit(validLead())).status, 201, 'recovers once the database is back');
    });
});
