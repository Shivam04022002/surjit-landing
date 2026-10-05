// Minimal structured logger. Callers pass a message and a small metadata
// object; request bodies, phone numbers and form values must never be passed
// in. Silent under NODE_ENV=test unless LOG_IN_TESTS is set.
const silent = process.env.NODE_ENV === 'test' && !process.env.LOG_IN_TESTS;

const write = (level, message, meta) => {
    if (silent) return;
    const line = { level, time: new Date().toISOString(), message };
    if (meta && Object.keys(meta).length) line.meta = meta;
    const out = JSON.stringify(line);
    if (level === 'error' || level === 'warn') console.error(out);
    else console.log(out);
};

module.exports = {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta)
};
