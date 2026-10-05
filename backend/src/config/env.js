// Every environment-specific setting, read once and validated here. Nothing
// else in the application reads process.env directly.
require('dotenv').config({ quiet: true });

const int = (name, fallback) => {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) throw new Error(`${name} must be an integer`);
    return n;
};

const list = (name, fallback = '') =>
    String(process.env[name] ?? fallback).split(',').map((s) => s.trim()).filter(Boolean);

const NODE_ENV = process.env.NODE_ENV || 'development';

const env = {
    NODE_ENV,
    isProduction: NODE_ENV === 'production',
    isTest: NODE_ENV === 'test',

    // Bound to loopback by default: in production Nginx is the only thing that
    // should reach the API.
    HOST: process.env.HOST || '127.0.0.1',
    PORT: int('PORT', 5050),

    MONGODB_URI: process.env.MONGODB_URI || '',

    // Exact origins allowed to call the API from a browser.
    CORS_ORIGINS: list('CORS_ORIGINS', 'http://localhost:5173'),

    // Hops of reverse proxy in front of the app (Nginx = 1). Decides what
    // req.ip means, which the rate limiters key on.
    TRUST_PROXY: int('TRUST_PROXY', 1),

    // Loan amount bounds, in rupees. The minimum comes from the form reference;
    // the maximum is a business setting and must match VITE_LOAN_MAX_AMOUNT.
    LOAN_MIN_AMOUNT: int('LOAN_MIN_AMOUNT', 10000),
    LOAN_MAX_AMOUNT: int('LOAN_MAX_AMOUNT', 5000000),

    // Public PIN-code lookup provider (no credentials).
    PINCODE_API_BASE_URL: process.env.PINCODE_API_BASE_URL || 'https://api.postalpincode.in/pincode',
    PINCODE_TIMEOUT_MS: int('PINCODE_TIMEOUT_MS', 5000),

    // Rate limits, per client IP.
    LEAD_RATE_LIMIT_WINDOW_MS: int('LEAD_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000),
    LEAD_RATE_LIMIT_MAX: int('LEAD_RATE_LIMIT_MAX', 10),
    PINCODE_RATE_LIMIT_WINDOW_MS: int('PINCODE_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    PINCODE_RATE_LIMIT_MAX: int('PINCODE_RATE_LIMIT_MAX', 60),
    ANALYTICS_RATE_LIMIT_WINDOW_MS: int('ANALYTICS_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    ANALYTICS_RATE_LIMIT_MAX: int('ANALYTICS_RATE_LIMIT_MAX', 300),

    // How long anonymous analytics events are kept before MongoDB expires them.
    ANALYTICS_RETENTION_DAYS: int('ANALYTICS_RETENTION_DAYS', 365)
};

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

const validate = () => {
    const problems = [];
    if (!env.MONGODB_URI) problems.push('MONGODB_URI is required');
    if (env.LOAN_MIN_AMOUNT < 1) problems.push('LOAN_MIN_AMOUNT must be positive');
    if (env.LOAN_MAX_AMOUNT <= env.LOAN_MIN_AMOUNT) problems.push('LOAN_MAX_AMOUNT must be greater than LOAN_MIN_AMOUNT');
    if (env.ANALYTICS_RETENTION_DAYS < 1) problems.push('ANALYTICS_RETENTION_DAYS must be at least 1');
    if (env.isProduction && env.CORS_ORIGINS.some((o) => o.startsWith('http://'))) {
        problems.push('CORS_ORIGINS must use https:// in production');
    }
    // In production only Nginx may reach the API: it must listen on loopback,
    // never on a public or all-interfaces address.
    if (env.isProduction && !LOOPBACK_HOSTS.has(env.HOST)) {
        problems.push(`HOST must be a loopback address in production (127.0.0.1, ::1 or localhost), not "${env.HOST}"`);
    }
    // 0 means "any free port" (used by tests); production is pinned to 5050 by
    // the deploy script.
    if (env.PORT < 0 || env.PORT > 65535) problems.push('PORT must be between 0 and 65535');
    return problems;
};

module.exports = env;
module.exports.validate = validate;
