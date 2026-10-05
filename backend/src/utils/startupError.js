const { IndexConflictError } = require('../config/db');

const days = (seconds) => (typeof seconds === 'number' ? Math.round(seconds / 86400) : null);

// Turns a failure during database start-up into one clear log entry:
// { message, meta }. Never includes the connection string or its credentials.
const describeStartupError = (err) => {
    if (err instanceof IndexConflictError) {
        const ttl = (err.details.conflicts || []).find(
            (c) => c.existingExpireAfterSeconds !== c.requestedExpireAfterSeconds
        );
        if (ttl && err.details.collection === 'analyticsevents') {
            return {
                message: 'Analytics retention index conflict: the existing analytics TTL index has a different '
                    + 'retention value than ANALYTICS_RETENTION_DAYS. No index or data was changed. The API will '
                    + 'not start until they match: either restore the previous ANALYTICS_RETENTION_DAYS, or, once '
                    + 'the change is approved, update the index with collMod (DEPLOYMENT.md → "Changing analytics retention").',
                meta: {
                    codeName: err.codeName,
                    collection: err.details.collection,
                    index: ttl.index,
                    existingRetentionDays: days(ttl.existingExpireAfterSeconds),
                    requestedRetentionDays: days(ttl.requestedExpireAfterSeconds)
                }
            };
        }
        return {
            message: 'MongoDB index conflict: a declared index differs from the one already in the database. '
                + 'No index or data was changed. Resolve it manually before starting the API.',
            meta: { codeName: err.codeName, collection: err.details.collection, conflicts: err.details.conflicts }
        };
    }

    // Connection, authentication and anything else. Name and codeName only:
    // driver messages can echo the host and user from the connection string.
    return {
        message: 'MongoDB connection failed',
        meta: { error: err?.name, codeName: err?.codeName, code: err?.code }
    };
};

module.exports = { describeStartupError };
