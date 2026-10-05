const analyticsService = require('../services/analytics.service');
const { validateEvent } = require('../validators/analytics.validator');
const { sendSuccess, sendError } = require('../utils/response');

// POST /api/analytics/events — anonymous first-party beacon.
//
// 202 accepted (recorded, or silently dropped as automated traffic)
// 400 the event is not one this API records
const recordEvent = async (req, res) => {
    const userAgent = req.get('User-Agent');

    // Same answer as a recorded event, so a bot learns nothing from the reply.
    if (analyticsService.isBot(userAgent)) {
        return sendSuccess(res, 202, 'Accepted');
    }

    const { value, errors } = validateEvent(req.body);
    if (errors.length) {
        return sendError(res, 400, 'Invalid analytics event', errors);
    }

    await analyticsService.record(value, userAgent);
    return sendSuccess(res, 202, 'Accepted');
};

module.exports = { recordEvent };
