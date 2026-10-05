const env = require('./src/config/env');
const logger = require('./src/utils/logger');
const db = require('./src/config/db');
const { describeStartupError } = require('./src/utils/startupError');
const app = require('./app');

const start = async () => {
    const problems = env.validate();
    if (problems.length) {
        problems.forEach((p) => logger.error('Configuration error', { problem: p }));
        process.exit(1);
    }

    try {
        await db.connect(env.MONGODB_URI);
    } catch (err) {
        const { message, meta } = describeStartupError(err);
        logger.error(message, meta);
        await db.disconnect().catch(() => {});
        // PM2 retries with an exponential backoff (ecosystem.config.js).
        process.exit(1);
    }

    const server = app.listen(env.PORT, env.HOST, () => {
        logger.info('API listening', { host: env.HOST, port: env.PORT, env: env.NODE_ENV });
    });

    const shutdown = (signal) => {
        logger.info('Shutting down', { signal });
        server.close(async () => {
            await db.disconnect().catch(() => {});
            process.exit(0);
        });
        // Do not hang a deploy on a stuck connection.
        setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

start();
