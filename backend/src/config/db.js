const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Fail fast while disconnected rather than queueing operations: a visitor
// submitting a form gets a prompt "temporarily unavailable" instead of a
// request that hangs until Mongoose's buffer times out.
mongoose.set('bufferCommands', false);
mongoose.set('strictQuery', true);
// With buffering off, Mongoose's automatic collection/index creation would run
// when a model is defined — before any connection exists. It is done
// explicitly in connect() instead.
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);

// MongoDB's answers when an index of the same name or keys already exists with
// different options (e.g. a TTL index whose expireAfterSeconds has changed
// because ANALYTICS_RETENTION_DAYS was edited).
const INDEX_CONFLICT_CODES = new Set([85, 86]); // IndexOptionsConflict, IndexKeySpecsConflict

// Raised instead of the driver's error when a declared index conflicts with
// one already in the database. Nothing is dropped or modified: resolving it is
// an operator decision (see DEPLOYMENT.md → "Changing analytics retention").
class IndexConflictError extends Error {
    constructor(details, cause) {
        super(`Index conflict on ${details.collection}`);
        this.name = 'IndexConflictError';
        this.code = cause?.code;
        this.codeName = cause?.codeName;
        this.details = details;
    }
}

// Mongoose's default name for an index without an explicit one: occurredAt_1.
const defaultIndexName = (fields) => Object.entries(fields).map(([k, v]) => `${k}_${v}`).join('_');

// Which declared indexes differ from what the database holds. Reads index
// metadata only.
const findConflicts = async (model) => {
    let existing = [];
    try {
        existing = await model.collection.indexes();
    } catch {
        return [];
    }
    const conflicts = [];
    for (const [fields, options = {}] of model.schema.indexes()) {
        const name = options.name || defaultIndexName(fields);
        const found = existing.find((i) => i.name === name);
        if (!found) continue;
        const requestedTtl = options.expireAfterSeconds;
        const existingTtl = found.expireAfterSeconds;
        if (requestedTtl !== existingTtl || Boolean(options.unique) !== Boolean(found.unique)) {
            conflicts.push({
                index: name,
                existingExpireAfterSeconds: existingTtl ?? null,
                requestedExpireAfterSeconds: requestedTtl ?? null,
                existingUnique: Boolean(found.unique),
                requestedUnique: Boolean(options.unique)
            });
        }
    }
    return conflicts;
};

// Creates each model's declared indexes. createIndexes is additive: it never
// drops or rewrites an index. A conflict is reported, not resolved.
const ensureIndexes = async () => {
    for (const model of Object.values(mongoose.models)) {
        try {
            await model.createIndexes();
        } catch (err) {
            if (!INDEX_CONFLICT_CODES.has(err.code)) throw err;
            throw new IndexConflictError({
                collection: model.collection.collectionName,
                conflicts: await findConflicts(model)
            }, err);
        }
    }
};

const connect = async (uri) => {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    await ensureIndexes();
    // Host and database name only; never the credentials in the URI.
    logger.info('MongoDB connected', { host: mongoose.connection.host, db: mongoose.connection.name });
};

const disconnect = () => mongoose.disconnect();

module.exports = { connect, disconnect, ensureIndexes, IndexConflictError };
