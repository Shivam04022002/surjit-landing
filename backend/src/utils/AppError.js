// An error whose message is safe to show a visitor. Anything thrown that is not
// an AppError is reported as a generic server error.
class AppError extends Error {
    constructor(message, status = 400, errors = []) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.errors = errors;
    }
}

module.exports = AppError;
