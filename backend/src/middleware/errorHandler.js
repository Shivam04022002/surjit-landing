const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { sendError } = require('../utils/response');

// Database unavailability, as reported by the driver or by Mongoose when
// command buffering is off and there is no connection.
const DB_UNAVAILABLE = new Set([
    'MongooseError', 'MongoNetworkError', 'MongoServerSelectionError',
    'MongoNotConnectedError', 'MongoNetworkTimeoutError'
]);

// Errors whose message can quote the value that failed — a phone number, a
// name, a PIN, a loan amount. Their message is never logged.
//   ValidationError  "Path `phoneNumber` is invalid (98765…)"
//   CastError        'Cast to Number failed for value "…"'
//   MongoServerError "E11000 duplicate key … dup key: { … }"
const VALUE_BEARING = new Set([
    'ValidationError', 'CastError', 'ValidatorError', 'MongoServerError', 'MongoBulkWriteError',
    'StrictModeError', 'DocumentNotFoundError', 'VersionError'
]);

// Any run of five or more digits: a PIN, phone number or rupee amount.
const LONG_NUMBER = /\d{5,}/g;

// The diagnostics that are safe to log for an error: its type, which fields
// were involved and how they failed — never the values.
const safeErrorMeta = (err) => {
    const meta = { error: err?.name || 'Error' };
    if (err?.code !== undefined) meta.code = err.code;
    if (err?.codeName) meta.codeName = err.codeName;

    if (err?.name === 'ValidationError' && err.errors && typeof err.errors === 'object') {
        // Field path → validator kind (required, regexp, enum, maxlength, Number…).
        meta.fields = Object.fromEntries(
            Object.entries(err.errors).map(([path, e]) => [path, e?.kind || e?.name || 'invalid'])
        );
        return meta;
    }
    if (err?.name === 'CastError') {
        meta.path = err.path;
        meta.kind = err.kind;
        return meta;
    }
    if (err?.code === 11000) {
        // Which unique key collided — never its value (keyValue).
        meta.keys = Object.keys(err.keyPattern || {});
        return meta;
    }
    if (VALUE_BEARING.has(err?.name)) {
        return meta;
    }

    // Anything else (a programming error, say) keeps its message for
    // debugging, with long digit runs masked in case a value slipped in.
    if (typeof err?.message === 'string') {
        meta.message = err.message.replace(LONG_NUMBER, '[number]').slice(0, 300);
    }
    return meta;
};

const notFound = (req, res) => sendError(res, 404, 'Not found');

// Every error ends here. A visitor sees a safe message only — never a stack
// trace, driver message or environment detail. The log records the route and
// safeErrorMeta(): never the request body, form values or a value-bearing
// error message.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
    if (err instanceof AppError) {
        return sendError(res, err.status, err.message, err.errors);
    }

    // Body parser failures.
    if (err.type === 'entity.too.large') {
        return sendError(res, 413, 'Request is too large');
    }
    if (err.type === 'entity.parse.failed') {
        return sendError(res, 400, 'Request body must be valid JSON');
    }

    const route = `${req.method} ${req.baseUrl || ''}${req.route?.path || ''}`;

    if (DB_UNAVAILABLE.has(err.name)) {
        logger.error('Database unavailable', { route, error: err.name });
        return sendError(res, 503, 'The service is temporarily unavailable. Please try again shortly.');
    }

    logger.error('Unhandled error', { route, ...safeErrorMeta(err) });
    return sendError(res, 500, 'Something went wrong. Please try again.');
};

module.exports = { notFound, errorHandler, safeErrorMeta };
