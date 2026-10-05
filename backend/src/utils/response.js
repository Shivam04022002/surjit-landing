// One response envelope for every endpoint, which the frontend API client
// relies on:
//
//   { success: true,  message, data }
//   { success: false, message, errors: [{ field, message }] }

const sendSuccess = (res, status, message, data = {}) =>
    res.status(status).json({ success: true, message, data });

const sendError = (res, status, message, errors = []) =>
    res.status(status).json({ success: false, message, errors });

module.exports = { sendSuccess, sendError };
