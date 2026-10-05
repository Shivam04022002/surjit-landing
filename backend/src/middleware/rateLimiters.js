const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// Per-IP limits on the three public endpoints. req.ip is derived through the
// app's trust-proxy setting, so behind Nginx it is the visitor's address.
//
// The default in-memory store is correct for a single PM2 process. Running
// several instances would need a shared store (e.g. Redis) instead.
const limiter = (windowMs, max, message) => rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message, errors: [] }
});

const leadLimiter = limiter(
    env.LEAD_RATE_LIMIT_WINDOW_MS,
    env.LEAD_RATE_LIMIT_MAX,
    'You have submitted several enquiries recently. Please try again later.'
);

const pincodeLimiter = limiter(
    env.PINCODE_RATE_LIMIT_WINDOW_MS,
    env.PINCODE_RATE_LIMIT_MAX,
    'Too many PIN code lookups. Please enter your location manually or try again later.'
);

const analyticsLimiter = limiter(
    env.ANALYTICS_RATE_LIMIT_WINDOW_MS,
    env.ANALYTICS_RATE_LIMIT_MAX,
    'Too many requests.'
);

module.exports = { leadLimiter, pincodeLimiter, analyticsLimiter };
