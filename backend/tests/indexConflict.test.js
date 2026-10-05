// Changing ANALYTICS_RETENTION_DAYS after the first deployment: the existing
// TTL index conflicts with the declared one. Start-up must stop with a clear
// diagnostic, and must never drop or rewrite the index or touch any data.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://placeholder-not-used';
process.env.ANALYTICS_RETENTION_DAYS = '365';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const db = require('../src/config/db');
const AnalyticsEvent = require('../src/models/AnalyticsEvent');
require('../src/models/Lead');
const { describeStartupError } = require('../src/utils/startupError');

const DAY = 86400;
let mongo;
let uri;

// An earlier deployment ran with 30-day retention: the index already exists
// with that value when this build (365 days) starts.
before(async () => {
    mongo = await MongoMemoryServer.create();
    uri = mongo.getUri('surjit_landing_conflict');
    await db.connect(uri);
    await AnalyticsEvent.create({ name: 'page_view', sessionId: 'abcdef0123456789', path: '/' });
    await mongoose.connection.db.command({
        collMod: 'analyticsevents',
        index: { name: 'occurredAt_ttl', expireAfterSeconds: 30 * DAY }
    });
});

after(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
});

const ttlIndex = async () =>
    (await mongoose.connection.db.collection('analyticsevents').indexes()).find((i) => i.name === 'occurredAt_ttl');

describe('Analytics retention index conflict', () => {
    test('is reported as a typed error naming the existing and requested retention', async () => {
        const before = await mongoose.connection.db.collection('analyticsevents').indexes();

        await assert.rejects(db.ensureIndexes(), (err) => {
            assert.ok(err instanceof db.IndexConflictError);
            assert.equal(err.code, 85);
            assert.equal(err.codeName, 'IndexOptionsConflict');
            assert.equal(err.details.collection, 'analyticsevents');
            assert.deepEqual(err.details.conflicts, [{
                index: 'occurredAt_ttl',
                existingExpireAfterSeconds: 30 * DAY,
                requestedExpireAfterSeconds: 365 * DAY,
                existingUnique: false,
                requestedUnique: false
            }]);

            const { message, meta } = describeStartupError(err);
            assert.match(message, /^Analytics retention index conflict/);
            assert.match(message, /No index or data was changed/);
            assert.doesNotMatch(message, /MongoDB connection failed/);
            assert.deepEqual(meta, {
                codeName: 'IndexOptionsConflict',
                collection: 'analyticsevents',
                index: 'occurredAt_ttl',
                existingRetentionDays: 30,
                requestedRetentionDays: 365
            });
            return true;
        });

        // Nothing was dropped or rewritten, and no data was removed.
        assert.equal((await ttlIndex()).expireAfterSeconds, 30 * DAY);
        const afterIdx = await mongoose.connection.db.collection('analyticsevents').indexes();
        assert.deepEqual(afterIdx.map((i) => i.name).sort(), before.map((i) => i.name).sort());
        assert.equal(await AnalyticsEvent.countDocuments(), 1);
    });

    test('server.js exits with the clear diagnostic, not "MongoDB connection failed"', async () => {
        const backend = path.join(__dirname, '..');
        const child = spawn(process.execPath, ['server.js'], {
            cwd: backend,
            env: {
                ...process.env,
                NODE_ENV: 'development',
                MONGODB_URI: uri,
                ANALYTICS_RETENTION_DAYS: '365',
                PORT: '0'
            }
        });
        let stderr = '';
        child.stderr.on('data', (d) => { stderr += d; });
        const code = await new Promise((resolve) => child.on('exit', resolve));

        assert.equal(code, 1);
        const line = stderr.split('\n').find((l) => l.includes('retention index conflict'));
        assert.ok(line, `diagnostic logged; stderr was: ${stderr.slice(0, 300)}`);
        const entry = JSON.parse(line);
        assert.equal(entry.level, 'error');
        assert.equal(entry.meta.codeName, 'IndexOptionsConflict');
        assert.equal(entry.meta.existingRetentionDays, 30);
        assert.equal(entry.meta.requestedRetentionDays, 365);
        assert.doesNotMatch(stderr, /MongoDB connection failed/);
        assert.ok(!stderr.includes(uri), 'connection string is not logged');

        // Still untouched after a real start-up attempt.
        assert.equal((await ttlIndex()).expireAfterSeconds, 30 * DAY);
        assert.equal(await AnalyticsEvent.countDocuments(), 1);
    });

    test('after the documented collMod aligns the index, start-up succeeds with data intact', async () => {
        // The operator step from DEPLOYMENT.md → "Changing analytics retention".
        await mongoose.connection.db.command({
            collMod: 'analyticsevents',
            index: { name: 'occurredAt_ttl', expireAfterSeconds: 365 * DAY }
        });
        await db.ensureIndexes();
        assert.equal((await ttlIndex()).expireAfterSeconds, 365 * DAY);
        assert.equal(await AnalyticsEvent.countDocuments(), 1);
    });
});

describe('Other start-up failures', () => {
    test('a connection failure logs name and codeName only — never the URI or driver message', () => {
        const err = Object.assign(new Error('connect ECONNREFUSED mongodb://landing_app:secret@10.0.0.5:27017'), {
            name: 'MongoServerSelectionError'
        });
        const { message, meta } = describeStartupError(err);
        assert.equal(message, 'MongoDB connection failed');
        assert.equal(meta.error, 'MongoServerSelectionError');
        assert.ok(!JSON.stringify(meta).includes('secret'));
        assert.ok(!JSON.stringify(meta).includes('10.0.0.5'));
    });
});
