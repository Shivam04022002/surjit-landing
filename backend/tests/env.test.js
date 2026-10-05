// Start-up configuration checks. Each case loads env.js in a fresh child
// process so one case's variables cannot leak into another.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ENV_JS = path.join(__dirname, '..', 'src', 'config', 'env.js');

const problemsFor = (vars) => {
    const out = execFileSync(process.execPath, ['-e', `console.log(JSON.stringify(require(${JSON.stringify(ENV_JS)}).validate()))`], {
        // A clean environment: only what the case sets, plus PATH for Windows.
        env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, ...vars },
        cwd: path.join(__dirname, '..', 'tests') // no .env file here
    });
    return JSON.parse(out.toString());
};

const PROD = {
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://landing_app:placeholder@127.0.0.1:27017/surjit_landing',
    CORS_ORIGINS: 'https://landing.example.test'
};

describe('Production configuration', () => {
    test('a valid production configuration has no problems', () => {
        assert.deepEqual(problemsFor(PROD), []);
    });

    test('the API must bind to loopback in production', () => {
        for (const HOST of ['0.0.0.0', '::', '10.0.1.25', '203.0.113.7']) {
            const problems = problemsFor({ ...PROD, HOST });
            assert.ok(problems.some((p) => p.startsWith('HOST must be a loopback address')), HOST);
        }
        for (const HOST of ['127.0.0.1', '::1', 'localhost']) {
            assert.deepEqual(problemsFor({ ...PROD, HOST }), [], HOST);
        }
    });

    test('defaults to 127.0.0.1:5050 when HOST and PORT are not set', () => {
        const out = execFileSync(process.execPath, ['-e', `const e=require(${JSON.stringify(ENV_JS)});console.log(e.HOST+':'+e.PORT)`], {
            env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, ...PROD },
            cwd: path.join(__dirname, '..', 'tests')
        });
        assert.equal(out.toString().trim(), '127.0.0.1:5050');
    });

    test('missing database, http CORS origin and bad port are refused', () => {
        const problems = problemsFor({ NODE_ENV: 'production', CORS_ORIGINS: 'http://landing.example.test', PORT: '70000' });
        assert.ok(problems.includes('MONGODB_URI is required'));
        assert.ok(problems.includes('CORS_ORIGINS must use https:// in production'));
        assert.ok(problems.includes('PORT must be between 0 and 65535'));
    });
});

describe('Development configuration', () => {
    test('a non-loopback HOST is allowed outside production', () => {
        assert.deepEqual(problemsFor({ NODE_ENV: 'development', MONGODB_URI: 'mongodb://x', HOST: '0.0.0.0' }), []);
    });
});
