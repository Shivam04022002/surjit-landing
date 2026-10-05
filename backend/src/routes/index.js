const express = require('express');
const mongoose = require('mongoose');
const leadController = require('../controllers/lead.controller');
const pincodeController = require('../controllers/pincode.controller');
const analyticsController = require('../controllers/analytics.controller');
const { leadLimiter, pincodeLimiter, analyticsLimiter } = require('../middleware/rateLimiters');
const { sendSuccess, sendError } = require('../utils/response');

const router = express.Router();

// Liveness plus database state, for the deploy check and uptime monitoring.
router.get('/health', (req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    if (!dbUp) return sendError(res, 503, 'Database unavailable');
    return sendSuccess(res, 200, 'OK', { status: 'ok' });
});

router.get('/leads/config', leadController.getConfig);
router.post('/leads', leadLimiter, leadController.createLead);

router.get('/pincode/:pincode', pincodeLimiter, pincodeController.lookup);

router.post('/analytics/events', analyticsLimiter, analyticsController.recordEvent);

module.exports = router;
