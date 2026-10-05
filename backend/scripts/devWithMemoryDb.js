// Local development without a MongoDB install: starts a throwaway in-memory
// MongoDB, then the API against it. All data is lost when this process stops.
//
//   npm run dev:memory
//
// Never use this in production.
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
    const mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri('surjit_landing_dev');
    console.log(`In-memory MongoDB ready (data is discarded on exit): ${mongo.getUri()}`);

    const stop = async () => {
        await mongo.stop().catch(() => {});
    };
    process.on('exit', stop);

    require('../server');
})().catch((err) => {
    console.error('Could not start the in-memory MongoDB:', err.message);
    process.exit(1);
});
