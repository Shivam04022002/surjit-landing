// Shared harness: the real app over HTTP, against an in-memory MongoDB.
// Nothing here reaches a real database or the PIN-code provider.
//
// Each test file runs in its own process (node --test), so a file may set
// process.env before requiring this to change limits for that file only.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://placeholder-not-used';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'https://landing.example';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const db = require('../src/config/db');
const app = require('../app');

const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

const harness = {
    mongo: null,
    server: null,
    baseUrl: '',

    async start() {
        this.mongo = await MongoMemoryServer.create();
        await db.connect(this.mongo.getUri('surjit_landing_test'));
        this.server = app.listen(0, '127.0.0.1');
        await new Promise((r) => this.server.once('listening', r));
        this.baseUrl = `http://127.0.0.1:${this.server.address().port}`;
    },

    async stop() {
        await new Promise((r) => (this.server ? this.server.close(r) : r()));
        await mongoose.disconnect();
        await this.mongo?.stop();
    },

    async call(method, path, { body, headers = {}, rawBody } = {}) {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                'User-Agent': BROWSER_UA,
                ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...headers
            },
            body: rawBody !== undefined ? rawBody : (body !== undefined ? JSON.stringify(body) : undefined)
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        return { status: res.status, json, text, headers: res.headers };
    }
};

let keySeq = 0;
const idempotencyKey = () => `test-key-${process.pid}-${(keySeq += 1).toString().padStart(8, '0')}`;

const validLead = (overrides = {}) => ({
    pinCode: '226001',
    state: 'Uttar Pradesh',
    district: 'Lucknow',
    country: 'India',
    desiredLoanAmount: 250000,
    useOfFunds: 'working-capital',
    averageMonthlySale: '1.5L-3L',
    businessVintage: '3-5',
    creditScore: '650-750',
    businessName: 'Sharma Traders',
    ownerName: 'Ravi Sharma',
    phoneNumber: '9876543210',
    consentAccepted: true,
    ...overrides
});

module.exports = { harness, idempotencyKey, validLead, BROWSER_UA };
