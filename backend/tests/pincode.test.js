// Short timeout for this file only (it runs in its own process).
process.env.PINCODE_TIMEOUT_MS = '200';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers');
const pincode = require('../src/services/pincode.service');

// A fake provider: never the real postal API.
const provider = { mode: 'ok', calls: [] };
const okBody = (pin) => [{
    Message: 'Number of pincode(s) found:1',
    Status: 'Success',
    PostOffice: [{ Name: 'GPO', District: 'Lucknow', State: 'Uttar Pradesh', Country: 'India', Pincode: pin }]
}];

const fakeFetch = async (url, options) => {
    provider.calls.push(url);
    const pin = url.split('/').pop();
    switch (provider.mode) {
        case 'ok': return new Response(JSON.stringify(okBody(pin)), { status: 200 });
        case 'not-found': return new Response(JSON.stringify([{ Message: 'No records found', Status: 'Error', PostOffice: null }]), { status: 200 });
        case 'http-500': return new Response('boom', { status: 500 });
        case 'garbage': return new Response('<html>not json</html>', { status: 200 });
        case 'network': throw new TypeError('fetch failed');
        case 'timeout':
            // Honours the abort signal the service passes, like real fetch.
            return new Promise((_, reject) => {
                options.signal.addEventListener('abort', () => reject(options.signal.reason));
            });
        default: throw new Error('unknown mode');
    }
};

const lookup = (pin) => harness.call('GET', `/api/pincode/${pin}`);

before(async () => {
    pincode._setFetch(fakeFetch);
    await harness.start();
});
after(() => harness.stop());
beforeEach(() => {
    provider.mode = 'ok';
    provider.calls = [];
    pincode._clearCache();
});

describe('PIN-code lookup', () => {
    test('a known PIN returns state, district and country', async () => {
        const res = await lookup('226001');
        assert.equal(res.status, 200);
        assert.deepEqual(res.json.data, { pinCode: '226001', state: 'Uttar Pradesh', district: 'Lucknow', country: 'India' });
    });

    test('an invalid PIN is refused without calling the provider', async () => {
        for (const pin of ['12345', '1234567', '012345', 'abcdef']) {
            const res = await lookup(pin);
            assert.equal(res.status, 400, pin);
        }
        assert.equal(provider.calls.length, 0);
    });

    test('an unknown PIN is a 404', async () => {
        provider.mode = 'not-found';
        const res = await lookup('999999');
        assert.equal(res.status, 404);
        assert.equal(res.json.success, false);
    });

    test('provider errors, garbage and network failures are a 503 with a manual-entry message', async () => {
        for (const mode of ['http-500', 'garbage', 'network']) {
            provider.mode = mode;
            pincode._clearCache();
            const res = await lookup('226001');
            assert.equal(res.status, 503, mode);
            assert.match(res.json.message, /manually/);
            assert.doesNotMatch(res.text, /fetch failed|TypeError|postalpincode/);
        }
    });

    test('a slow provider times out instead of hanging', async () => {
        provider.mode = 'timeout';
        const started = Date.now();
        const res = await lookup('226001');
        assert.equal(res.status, 503);
        assert.ok(Date.now() - started < 3000, 'gave up promptly');
    });

    test('answers are cached; failures are not', async () => {
        await lookup('226001');
        await lookup('226001');
        assert.equal(provider.calls.length, 1, 'second lookup served from cache');

        provider.mode = 'network';
        await lookup('110001');
        provider.mode = 'ok';
        const res = await lookup('110001');
        assert.equal(res.status, 200, 'a failure is retried, not remembered');
    });
});

describe('Provider response parsing', () => {
    test('picks the first office with a state and district', () => {
        const r = pincode.parse([{ Status: 'Success', PostOffice: [{ State: '', District: '' }, { State: 'Delhi', District: 'New Delhi', Country: 'India' }] }]);
        assert.deepEqual(r, { found: true, place: { state: 'Delhi', district: 'New Delhi', country: 'India' } });
    });

    test('an unexpected shape is a provider error', () => {
        assert.throws(() => pincode.parse({}), pincode.ProviderError);
        assert.throws(() => pincode.parse([]), pincode.ProviderError);
    });
});
