const pincodeService = require('../services/pincode.service');
const { PIN_CODE } = require('../validators/lead.validator');
const { sendSuccess, sendError } = require('../utils/response');

// GET /api/pincode/:pincode
//
// 200 { pinCode, state, district, country }
// 400 not a 6-digit PIN
// 404 the provider does not recognise it
// 503 the provider is unavailable — the form falls back to manual entry
const lookup = async (req, res) => {
    const pin = String(req.params.pincode || '');
    if (!PIN_CODE.test(pin)) {
        return sendError(res, 400, 'PIN code must be a valid 6-digit number', [
            { field: 'pinCode', message: 'Invalid PIN code' }
        ]);
    }

    let result;
    try {
        result = await pincodeService.lookup(pin);
    } catch (err) {
        if (err instanceof pincodeService.ProviderError) {
            return sendError(res, 503, 'PIN code lookup is temporarily unavailable. Please enter your location manually.');
        }
        throw err;
    }

    if (!result.found) {
        return sendError(res, 404, 'We could not find this PIN code. Please check it or enter your location manually.');
    }
    return sendSuccess(res, 200, 'OK', { pinCode: pin, ...result.place });
};

module.exports = { lookup };
