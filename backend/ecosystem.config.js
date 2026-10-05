// PM2 process definition for the SurjitLanding API — and only for it.
//
// Isolation from SurjitWeb (see DEPLOYMENT.md → "Isolation model"):
//   · runs as the dedicated Linux user `surjit-landing`, whose own PM2 daemon
//     (~surjit-landing/.pm2) cannot see or control SurjitWeb's processes;
//   · one process, always named `surjit-landing-api`;
//   · never started with restart/reload/startOrRestart, never with `all`.
//
// Always (re)start with delete + start, via deploy/scripts/deploy.sh or
// rollback.sh, which also verify the result:
//
//   pm2 delete surjit-landing-api          # skipped when it does not exist
//   pm2 start ecosystem.config.js --env production
//
// `cwd` is this file's directory. Started from
// /var/www/surjit-landing/current/backend, Node resolves it to the real
// release directory (…/releases/<release>/backend) — the value `pm_cwd` is
// checked against with `readlink -f current/backend`. No release directory is
// written here: it follows from wherever the file is started.
//
// One fork-mode instance: the rate limiters keep their counters in memory,
// which is only correct for a single process (see README → Scaling).
// Configuration comes from backend/.env, a symlink to
// /var/www/surjit-landing/shared/.env created by the deploy script.

// Outside the release directories, so logs survive deploys and rollbacks.
const LOG_DIR = '/var/www/surjit-landing/shared/logs';

module.exports = {
  apps: [
    {
      name: 'surjit-landing-api',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      kill_timeout: 12000,
      // A process that exits at startup (bad configuration, database
      // unreachable, index conflict) is retried with growing delays —
      // 100 ms doubling up to PM2's 15 s ceiling — instead of a tight loop.
      // The delay resets once the process has stayed up for 30 s.
      exp_backoff_restart_delay: 100,
      min_uptime: '30s',
      env_production: {
        NODE_ENV: 'production'
      },
      out_file: `${LOG_DIR}/api.out.log`,
      error_file: `${LOG_DIR}/api.err.log`,
      merge_logs: true,
      time: true
    }
  ]
};
