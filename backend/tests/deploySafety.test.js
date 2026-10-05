// Deployment isolation guarantees, enforced as tests so a later edit cannot
// quietly weaken them: SurjitLanding's deploy files may never restart, stop,
// delete or reconfigure anything belonging to SurjitWeb.
//
// Static checks read every deploy file. Behaviour checks source the real
// deploy/scripts/lib.sh in bash with stub `pm2`, `nginx` and `systemctl`
// commands, so nothing real is ever called.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPTS = path.join(ROOT, 'deploy', 'scripts');
const NGINX = path.join(ROOT, 'deploy', 'nginx');
const read = (p) => fs.readFileSync(p, 'utf8');

const scriptFiles = fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.sh')).map((f) => path.join(SCRIPTS, f));
const nginxFiles = fs.readdirSync(NGINX).map((f) => path.join(NGINX, f));
const ecosystem = path.join(ROOT, 'backend', 'ecosystem.config.js');
const deploymentDoc = path.join(ROOT, 'DEPLOYMENT.md');
const allDeployFiles = [...scriptFiles, ...nginxFiles, ecosystem, deploymentDoc];

// Executable shell statements (not comments), with backslash-continued lines
// joined so a multi-line command is checked as one.
const codeLines = (file) => {
    const out = [];
    let pending = null;
    read(file).split('\n').forEach((text, i) => {
        if (pending === null && /^\s*#/.test(text)) return;
        const joined = pending === null ? { text, line: i + 1 } : { text: `${pending.text} ${text.trim()}`, line: pending.line };
        if (/\\\s*$/.test(text)) {
            pending = { text: joined.text.replace(/\\\s*$/, ''), line: joined.line };
        } else {
            pending = null;
            out.push(joined);
        }
    });
    return out;
};

// `pm2` in command position (start of a statement, after ; && || | or $( ),
// as opposed to the word appearing inside a message string.
const PM2_COMMAND = /(^|[;&|(]\s*|\$\(\s*|then\s+|do\s+)pm2\s/;

// The commands an operator would copy from DEPLOYMENT.md: the lines inside
// fenced code blocks. Prose (including the "Never run" list) is not a command.
const docCommands = () => {
    const out = [];
    let inFence = false;
    read(deploymentDoc).split('\n').forEach((text, i) => {
        if (/^\s*```/.test(text)) { inFence = !inFence; return; }
        // Trailing shell comments are explanations, not part of the command.
        if (inFence && !/^\s*(#|\/\/)/.test(text)) out.push({ text: text.replace(/\s+#\s.*$/, ''), line: i + 1 });
    });
    return out;
};

// Statements that only print a message.
const isMessage = (text) => /^\s*(info|ok|warn|die|echo|printf)\b/.test(text);

// Every command line across the deploy files: script statements (messages
// excluded), the DEPLOYMENT.md code blocks, and the ecosystem file.
const allCommands = () => [
    ...scriptFiles.flatMap((f) => codeLines(f).filter(({ text }) => !isMessage(text)).map((l) => ({ ...l, file: f }))),
    ...docCommands().map((l) => ({ ...l, file: deploymentDoc })),
    ...read(ecosystem).split('\n').map((text, i) => ({ text, line: i + 1, file: ecosystem }))
        .filter(({ text }) => !/^\s*\/\//.test(text))
];

// JavaScript with comments removed.
const jsCode = (file) => read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('No command can reach another application', () => {
    test('PM2 is never addressed with `all`, and never restarted, reloaded, stopped or killed', () => {
        const forbidden = /pm2\s+(restart|reload|stop|kill|startOrRestart|startOrReload|delete\s+all|flush|update|resurrect)\b|pm2\s+\S+\s+all\b/;
        for (const { text, line, file } of allCommands()) {
            assert.doesNotMatch(text, forbidden, `${path.basename(file)}:${line}: ${text.trim()}`);
        }
        // The doc's "Never run" list must still name them, for the operator.
        assert.match(read(deploymentDoc), /❌ `pm2 restart all`/);
    });

    test('scripts call pm2 only through the guarded wrapper', () => {
        for (const file of scriptFiles) {
            for (const { text, line } of codeLines(file)) {
                if (!PM2_COMMAND.test(text.trim())) continue;
                const insideWrapper = path.basename(file) === 'lib.sh';
                assert.ok(insideWrapper || /pm2_landing\s/.test(text),
                    `${path.basename(file)}:${line} calls pm2 directly: ${text.trim()}`);
            }
        }
    });

    test('every PM2 delete names surjit-landing-api', () => {
        const lib = read(path.join(SCRIPTS, 'lib.sh'));
        assert.match(lib, /readonly APP_NAME="surjit-landing-api"/);
        assert.match(lib, /delete\)\s+pm2 delete "\$APP_NAME"/);
        for (const { text } of docCommands()) {
            for (const m of text.matchAll(/pm2 delete (\S+)/g)) assert.equal(m[1], 'surjit-landing-api', m[0]);
        }
    });

    test('nginx is only reloaded — never restarted or stopped — and only after nginx -t', () => {
        for (const { text, line, file } of allCommands()) {
            assert.doesNotMatch(text, /systemctl\s+(restart|stop)\s+nginx|service\s+nginx\s+(restart|stop)|nginx\s+-s\s+(stop|quit)/,
                `${path.basename(file)}:${line}: ${text.trim()}`);
        }
        // Every reload in the doc's commands is preceded by nginx -t on the same line.
        for (const { text, line } of docCommands()) {
            if (/systemctl reload nginx/.test(text)) assert.match(text, /nginx -t &&/, `DEPLOYMENT.md:${line}`);
        }
        const lib = read(path.join(SCRIPTS, 'lib.sh'));
        assert.match(lib, /nginx_reload_safely\(\) \{\n\s+nginx -t \|\| die[^\n]*\n\s+systemctl reload nginx/);
        // The only reload in the scripts is that function.
        const reloads = scriptFiles.flatMap((f) => codeLines(f).filter(({ text }) => /systemctl reload nginx/.test(text)));
        assert.equal(reloads.length, 1);
    });

    test('certbot is never run in --nginx mode (it would edit nginx files)', () => {
        for (const { text, line, file } of allCommands()) {
            assert.doesNotMatch(text, /certbot\s+--nginx|certbot\s+run\b|python3-certbot-nginx/, `${path.basename(file)}:${line}: ${text.trim()}`);
        }
        // The documented issuance is webroot with its own lineage.
        const issue = docCommands().map((l) => l.text).join('\n');
        assert.match(issue, /certbot certonly --webroot -w \/var\/www\/surjit-landing\/acme/);
        assert.match(issue, /--cert-name surjit-landing/);
    });

    test('nothing references SurjitWeb paths except the guard that refuses them', () => {
        for (const file of [...scriptFiles, ...nginxFiles, ecosystem]) {
            for (const { text, line } of codeLines(file)) {
                if (!/surjit-web/i.test(text)) continue;
                const isGuard = /FORBIDDEN_ROOT=|\*SurjitWeb\* \| \*surjitweb\* \| \*surjit-web\*/.test(text);
                assert.ok(isGuard, `${path.basename(file)}:${line}: ${text.trim()}`);
            }
        }
    });

    test('no destructive database command appears in any deploy file', () => {
        // mongorestore is only allowed as a command that renames into the test DB.
        const destructive = /dropDatabase|\.drop\(|--drop\b|deleteMany|db\.\w+\.remove\(|^\s*mongorestore\s+--(?!.*--nsTo=)/;
        for (const { text, line, file } of allCommands()) {
            assert.doesNotMatch(text, destructive, `${path.basename(file)}:${line}: ${text.trim()}`);
        }
        // The one restore writes only into the renamed test database.
        const restore = read(path.join(SCRIPTS, 'restore-test.sh'));
        assert.match(restore, /--nsTo="\$\{TEST_DB\}\.\*"/);
        assert.match(restore, /readonly TEST_DB="surjit_landing_restore_test"/);
    });
});

describe('PM2 configuration', () => {
    const cfg = require(ecosystem);
    const app = cfg.apps[0];

    test('exactly one app, named surjit-landing-api, single fork instance', () => {
        assert.equal(cfg.apps.length, 1);
        assert.equal(app.name, 'surjit-landing-api');
        assert.equal(app.instances, 1);
        assert.equal(app.exec_mode, 'fork');
    });

    test('cwd follows the file (no hard-coded release), logs live in shared/', () => {
        assert.equal(app.cwd, path.dirname(ecosystem));
        assert.doesNotMatch(jsCode(ecosystem), /\/releases\//);
        assert.equal(app.out_file, '/var/www/surjit-landing/shared/logs/api.out.log');
        assert.equal(app.error_file, '/var/www/surjit-landing/shared/logs/api.err.log');
    });

    test('a failing start backs off instead of looping', () => {
        assert.ok(app.exp_backoff_restart_delay > 0);
        assert.ok(app.min_uptime);
        assert.equal(app.env_production.NODE_ENV, 'production');
    });
});

describe('Nginx templates', () => {
    const https = read(path.join(NGINX, 'surjit-landing.conf.template'));
    const bootstrap = read(path.join(NGINX, 'surjit-landing.http-bootstrap.conf.template'));
    const directives = (t) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

    test('proxy to the landing API on loopback only', () => {
        const targets = [...directives(https).matchAll(/proxy_pass\s+([^;]+);/g)].map((m) => m[1]);
        assert.deepEqual(targets, ['http://127.0.0.1:5050']);
        assert.doesNotMatch(directives(bootstrap), /proxy_pass/);
    });

    test('never claim default_server, and serve only the landing domain', () => {
        for (const t of [https, bootstrap]) {
            assert.doesNotMatch(directives(t), /default_server/);
            for (const m of directives(t).matchAll(/server_name\s+([^;]+);/g)) assert.equal(m[1].trim(), 'LANDING_DOMAIN');
        }
    });

    test('http-level names are prefixed so they cannot collide with another site', () => {
        assert.match(https, /limit_req_zone \$binary_remote_addr zone=surjit_landing_api:/);
        assert.match(https, /log_format surjit_landing /);
        assert.match(https, /limit_req zone=surjit_landing_api /);
        assert.doesNotMatch(directives(bootstrap), /limit_req_zone|log_format/);
    });

    test('use their own certificate lineage, webroot and site root', () => {
        assert.match(https, /ssl_certificate \/etc\/letsencrypt\/live\/surjit-landing\/fullchain\.pem;/);
        assert.match(https, /ssl_certificate_key \/etc\/letsencrypt\/live\/surjit-landing\/privkey\.pem;/);
        assert.match(https, /root \/var\/www\/surjit-landing\/current\/frontend\/dist;/);
        for (const t of [https, bootstrap]) {
            for (const m of directives(t).matchAll(/root\s+([^;]+);/g)) assert.match(m[1], /^\/var\/www\/surjit-landing\//);
        }
    });
});

describe('Deploy scripts', () => {
    test('every script stops on the first error (set -Eeuo pipefail via lib.sh)', () => {
        assert.match(read(path.join(SCRIPTS, 'lib.sh')), /^set -Eeuo pipefail$/m);
        for (const file of scriptFiles.filter((f) => !f.endsWith('lib.sh'))) {
            assert.match(read(file), /^source "\$\(dirname "\$\(readlink -f "\$0"\)"\)\/lib\.sh"$/m, path.basename(file));
        }
    });

    test('deploy and rollback start PM2 with delete + start and verify the release', () => {
        for (const name of ['deploy.sh', 'rollback.sh']) {
            const s = read(path.join(SCRIPTS, name));
            assert.match(s, /if landing_exists; then pm2_landing delete; fi\npm2_landing start/, name);
            assert.match(s, /verify_running_release \|\| die/, name);
            assert.match(s, /assert_isolated_pm2/, name);
            assert.match(s, /assert_loopback_listener/, name);
        }
    });

    test('deploy never touches nginx', () => {
        const s = codeLines(path.join(SCRIPTS, 'deploy.sh')).map((l) => l.text).join('\n');
        assert.doesNotMatch(s, /nginx/);
    });
});

// ── Behaviour of the real guards, in bash, with stubs ─────────────────────────
const bash = spawnSync('bash', ['--version']);
const haveBash = bash.status === 0;

describe('lib.sh guards (executed in bash with stub commands)', { skip: !haveBash && 'bash not available' }, () => {
    let stubDir;
    let callLog;

    before(() => {
        stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'landing-stubs-'));
        callLog = path.join(stubDir, 'calls.log');
        const stub = (name, body) => {
            const p = path.join(stubDir, name);
            fs.writeFileSync(p, `#!/usr/bin/env bash\necho "${name} $*" >> "${callLog.replace(/\\/g, '/')}"\n${body}\n`);
            fs.chmodSync(p, 0o755);
        };
        stub('pm2', 'exit 0');
        stub('systemctl', 'exit 0');
        stub('nginx', '[ "$1" = "-t" ] && exit "${NGINX_T_EXIT:-0}"; exit 0');
    });

    after(() => fs.rmSync(stubDir, { recursive: true, force: true }));

    const run = (snippet, env = {}) => {
        fs.writeFileSync(callLog, '');
        const lib = path.join(SCRIPTS, 'lib.sh').replace(/\\/g, '/');
        const stubs = stubDir.replace(/\\/g, '/');
        const res = spawnSync('bash', ['-c', `export PATH="$(cygpath -u "${stubs}" 2>/dev/null || echo "${stubs}"):$PATH"; source "${lib}"; ${snippet}`], {
            env: { ...process.env, ...env },
            encoding: 'utf8'
        });
        return { status: res.status, out: `${res.stdout}${res.stderr}`, calls: fs.readFileSync(callLog, 'utf8').trim() };
    };

    test('pm2_landing refuses every command except the allowed ones, without calling pm2', () => {
        for (const cmd of ['restart', 'reload', 'stop', 'kill', 'startOrRestart', 'flush', 'update', 'resurrect']) {
            const r = run(`pm2_landing ${cmd} all`);
            assert.notEqual(r.status, 0, cmd);
            assert.match(r.out, /STOP pm2 .* is not allowed/, cmd);
            assert.equal(r.calls, '', `${cmd}: pm2 must not be called`);
        }
    });

    test('pm2_landing delete always targets surjit-landing-api, whatever is passed', () => {
        const r = run('pm2_landing delete surjit-web-api');
        assert.equal(r.status, 0);
        assert.equal(r.calls, 'pm2 delete surjit-landing-api');
    });

    test('pm2_landing start refuses to run outside current/backend', () => {
        const r = run('cd / && pm2_landing start');
        assert.notEqual(r.status, 0);
        assert.match(r.out, /pm2 start must run from \/var\/www\/surjit-landing\/current\/backend/);
        assert.equal(r.calls, '');
    });

    test('assert_landing_path allows only the landing tree', () => {
        for (const p of ['/var/www/surjit-landing/releases/20261005-120000', '/var/www/surjit-landing/shared/.env']) {
            assert.equal(run(`assert_landing_path "${p}"`).status, 0, p);
        }
        for (const p of ['/var/www/surjit-web', '/var/www/surjit-web/current/.env',
            '/var/www/surjit-landing/../surjit-web/shared', '/etc/nginx/sites-available/default', '/var/www', '/']) {
            const r = run(`assert_landing_path "${p}"`);
            assert.notEqual(r.status, 0, p);
            assert.match(r.out, /STOP Refusing to touch/, p);
        }
        assert.match(run('assert_landing_path /var/www/surjit-web/x').out, /belongs to SurjitWeb/);
    });

    test('nginx_reload_safely does not reload when nginx -t fails', () => {
        const r = run('nginx_reload_safely', { NGINX_T_EXIT: '1' });
        assert.notEqual(r.status, 0);
        assert.match(r.out, /nginx was NOT reloaded/);
        assert.equal(r.calls, 'nginx -t', 'systemctl must not be called');
    });

    test('nginx_reload_safely reloads (never restarts) when nginx -t passes', () => {
        const r = run('nginx_reload_safely', { NGINX_T_EXIT: '0' });
        assert.equal(r.status, 0);
        assert.equal(r.calls, 'nginx -t\nsystemctl reload nginx');
    });

    test('read_kv reads values without executing the file', () => {
        const f = path.join(stubDir, 'deploy.env');
        fs.writeFileSync(f, 'LANDING_REPO_URL="git@github.com:owner/surjit-landing.git"\nEVIL=$(touch /tmp/pwned)\n');
        const r = run(`read_kv "${f.replace(/\\/g, '/')}" LANDING_REPO_URL; read_kv "${f.replace(/\\/g, '/')}" EVIL`);
        assert.equal(r.out.trim(), 'git@github.com:owner/surjit-landing.git\n$(touch /tmp/pwned)');
    });
});
