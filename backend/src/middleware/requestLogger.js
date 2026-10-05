const logger = require('../utils/logger');

// Access log without personal data: method, the matched route pattern (so a
// PIN code in /api/pincode/:pincode is logged as ":pincode"), status and
// duration. No IP address, user-agent, query string or body.
const requestLogger = (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
        const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
        logger.info('request', {
            method: req.method,
            route,
            status: res.statusCode,
            ms: Number((process.hrtime.bigint() - started) / 1000000n)
        });
    });
    next();
};

module.exports = requestLogger;
