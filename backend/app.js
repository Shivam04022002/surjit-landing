const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const env = require('./src/config/env');
const routes = require('./src/routes');
const requestLogger = require('./src/middleware/requestLogger');
const { notFound, errorHandler } = require('./src/middleware/errorHandler');

const app = express();

// Nginx sits in front in production; this makes req.ip the visitor's address
// for rate limiting. Never set higher than the real number of proxies.
app.set('trust proxy', env.TRUST_PROXY);

// The API returns JSON only, so Helmet's defaults (including a restrictive
// CSP) apply unchanged.
app.use(helmet());

// Browsers may call the API only from the configured origins. A disallowed
// origin gets no CORS headers (the browser blocks the response) rather than a
// server error.
app.use(cors({
    origin: (origin, callback) => callback(null, !origin || env.CORS_ORIGINS.includes(origin)),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key'],
    maxAge: 600
}));

app.use(requestLogger);

// Every request body here is a small JSON object; 10 kB is far above the
// largest legitimate one.
app.use(express.json({ limit: '10kb', strict: true }));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
