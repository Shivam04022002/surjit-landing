const env = require('../config/env');
const logger = require('../utils/logger');

// PIN-code → { state, district, country }, through a public postal lookup
// service (default: api.postalpincode.in, which serves India Post data and
// needs no credentials).
//
// Outcomes:
//   { found: true, place }   the provider knows this PIN
//   { found: false }         the provider answered, and does not
//   throws ProviderError     timeout, network failure or an unreadable answer
//
// Successful and not-found answers are cached in memory; provider failures
// are not, so the next request tries again.

class ProviderError extends Error {}

const CACHE_MAX = 2000;
const FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

const cacheGet = (pin) => {
    const hit = cache.get(pin);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
        cache.delete(pin);
        return null;
    }
    return hit.value;
};

const cacheSet = (pin, value, ttl) => {
    // Oldest entry out first; Map preserves insertion order.
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(pin, { value, expires: Date.now() + ttl });
};

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 100) : '');

// The provider's answer is an array with one entry:
//   [{ Status: 'Success' | 'Error' | '404', PostOffice: [{ State, District, Country, ... }] | null }]
const parse = (body) => {
    const entry = Array.isArray(body) ? body[0] : null;
    if (!entry || typeof entry.Status !== 'string') throw new ProviderError('Unexpected provider response');
    const offices = Array.isArray(entry.PostOffice) ? entry.PostOffice : [];
    if (entry.Status !== 'Success' || offices.length === 0) return { found: false };

    const first = offices.find((o) => clean(o?.State) && clean(o?.District)) || null;
    if (!first) return { found: false };
    return {
        found: true,
        place: {
            state: clean(first.State),
            district: clean(first.District),
            country: clean(first.Country) || 'India'
        }
    };
};

// Replaceable in tests, so no test ever calls the real provider.
let fetchImpl = (...args) => fetch(...args);

const lookup = async (pin) => {
    const cached = cacheGet(pin);
    if (cached) return cached;

    let response;
    try {
        response = await fetchImpl(`${env.PINCODE_API_BASE_URL}/${pin}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(env.PINCODE_TIMEOUT_MS)
        });
    } catch (err) {
        // The PIN is not logged: only that the provider could not be reached.
        logger.warn('PIN lookup provider unreachable', { reason: err.name === 'TimeoutError' ? 'timeout' : 'network' });
        throw new ProviderError('Provider unreachable');
    }

    if (!response.ok) {
        logger.warn('PIN lookup provider returned an error', { status: response.status });
        throw new ProviderError(`Provider status ${response.status}`);
    }

    let body;
    try {
        body = await response.json();
    } catch {
        throw new ProviderError('Provider returned invalid JSON');
    }

    const result = parse(body);
    cacheSet(pin, result, result.found ? FOUND_TTL_MS : NOT_FOUND_TTL_MS);
    return result;
};

module.exports = {
    lookup,
    parse,
    ProviderError,
    _setFetch: (fn) => { fetchImpl = fn; },
    _clearCache: () => cache.clear()
};
