#!/usr/bin/env bash
# Shared helpers for the SurjitLanding server scripts. Sourced, never run.
#
# Every script that changes anything on the server goes through the guards
# here, so none of them can touch SurjitWeb:
#   · assert_landing_path   — files only under /var/www/surjit-landing
#   · pm2_landing           — PM2 only for the process surjit-landing-api
#   · assert_isolated_pm2   — PM2 only in the surjit-landing user's own daemon
#   · nginx_reload_safely   — nginx only `reload`, only after `nginx -t`
set -Eeuo pipefail

readonly APP_NAME="surjit-landing-api"
readonly LANDING_USER="surjit-landing"
readonly LANDING_ROOT="/var/www/surjit-landing"
readonly RELEASES_DIR="$LANDING_ROOT/releases"
readonly SHARED_DIR="$LANDING_ROOT/shared"
readonly CURRENT_LINK="$LANDING_ROOT/current"
readonly ACME_DIR="$LANDING_ROOT/acme"
readonly API_HOST="127.0.0.1"
readonly API_PORT="5050"
readonly LANDING_DB="surjit_landing"
# SurjitWeb's directory. Referenced only to refuse touching it.
readonly FORBIDDEN_ROOT="/var/www/surjit-web"

info() { printf '==> %s\n' "$*"; }
ok()   { printf ' OK  %s\n' "$*"; }
warn() { printf 'WARN %s\n' "$*" >&2; }
die()  { printf '\nSTOP %s\n' "$*" >&2; exit 1; }

# ── Filesystem ───────────────────────────────────────────────────────────────

# Refuses any path outside the landing root, and anything under SurjitWeb's.
assert_landing_path() {
  local p
  p="$(realpath -m -- "$1")"
  case "$p" in
    "$FORBIDDEN_ROOT" | "$FORBIDDEN_ROOT"/*) die "Refusing to touch $p: it belongs to SurjitWeb." ;;
    "$LANDING_ROOT" | "$LANDING_ROOT"/*) ;;
    *) die "Refusing to touch $p: it is outside $LANDING_ROOT." ;;
  esac
}

# KEY=VALUE files (shared/deploy.env). Read, never executed.
read_kv() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 0
  sed -n "s/^${key}=//p" "$file" | tail -n 1 | sed -e 's/^"//' -e 's/"$//'
}

# ── PM2 ──────────────────────────────────────────────────────────────────────

# The only way these scripts call PM2. `all`, restart, reload, stop, kill and
# startOrRestart are impossible by construction.
pm2_landing() {
  local cmd="$1"
  shift
  case "$cmd" in
    delete)   pm2 delete "$APP_NAME" ;;
    describe) pm2 describe "$APP_NAME" ;;
    start)
      # Only the landing ecosystem file, from the landing current release.
      [ "$(realpath -m "$PWD")" = "$(realpath -m "$CURRENT_LINK/backend")" ] \
        || die "pm2 start must run from $CURRENT_LINK/backend (now in $PWD)."
      pm2 start ecosystem.config.js --env production
      ;;
    jlist) pm2 jlist ;;
    save)  pm2 save ;;
    *) die "pm2 $cmd is not allowed by these scripts." ;;
  esac
}

# The landing app runs as its own Linux user, in that user's own PM2 daemon.
# That daemon must manage nothing but surjit-landing-api: if it shows any other
# process, we are in someone else's PM2 (e.g. SurjitWeb's) and must stop.
assert_isolated_pm2() {
  [ "$(id -un)" = "$LANDING_USER" ] \
    || die "Run this as the '$LANDING_USER' user (sudo -iu $LANDING_USER), not '$(id -un)'. Its PM2 daemon is separate from SurjitWeb's."
  command -v pm2 >/dev/null || die "pm2 is not installed for $LANDING_USER."
  local others
  others="$(pm2 jlist | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      const names = JSON.parse(s).map(p => p.name).filter(n => n !== process.argv[1]);
      console.log([...new Set(names)].join(","));
    });' "$APP_NAME")"
  [ -z "$others" ] \
    || die "This PM2 daemon also manages: $others. SurjitLanding must use its own PM2 (user $LANDING_USER). Nothing was changed."
  ok "PM2 daemon of $LANDING_USER manages only $APP_NAME (or nothing yet)"
}

# "<pm_cwd> <status> <pid>" of the landing process, or empty.
landing_process() {
  pm2 jlist | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      const app = JSON.parse(s).find(p => p.name === process.argv[1]);
      if (app) console.log(app.pm2_env.pm_cwd, app.pm2_env.status, app.pid);
    });' "$APP_NAME"
}

landing_exists() { [ -n "$(landing_process)" ]; }

# PM2 must be running the release that `current` points to. Returns non-zero on
# a mismatch; every caller then stops (`|| die …`) — nothing continues
# automatically.
verify_running_release() {
  local expected actual cwd status pid i
  expected="$(readlink -f "$CURRENT_LINK/backend")"
  for i in $(seq 1 10); do
    actual="$(landing_process)"
    read -r cwd status pid <<<"$actual" || true
    [ "${status:-}" = "online" ] && break
    sleep 1
  done
  echo "    expected cwd: $expected"
  echo "    PM2 pm_cwd:   ${cwd:-<none>} (status ${status:-<none>})"
  if [ "${cwd:-}" != "$expected" ] || [ "${status:-}" != "online" ]; then
    warn "PM2 is not running the current release (or it is not online). Stopped here; nothing further was done."
    return 1
  fi
  ok "PM2 runs $expected"
}

# ── Network ──────────────────────────────────────────────────────────────────

# Who is listening on the landing port: "free", "landing" or "other".
port_owner() {
  local lines pid
  lines="$(ss -Hltnp "sport = :$API_PORT" 2>/dev/null || true)"
  [ -n "$lines" ] || { echo free; return; }
  pid="$(read -r cwd status p <<<"$(landing_process)"; echo "${p:-}")"
  if [ -n "$pid" ] && grep -q "pid=$pid," <<<"$lines"; then echo landing; else echo other; fi
}

# The API must listen on loopback only.
assert_loopback_listener() {
  local lines
  lines="$(ss -Hltn "sport = :$API_PORT" 2>/dev/null || true)"
  [ -n "$lines" ] || die "Nothing is listening on port $API_PORT."
  if grep -vqE "(127\.0\.0\.1|\[::1\]):$API_PORT\b" <<<"$lines"; then
    die "Port $API_PORT is listening on a non-loopback address: $lines"
  fi
  ok "API listens on loopback only ($API_HOST:$API_PORT)"
}

api_health() {
  local i
  for i in $(seq 1 15); do
    if curl -fsS --max-time 5 "http://$API_HOST:$API_PORT/api/health" >/dev/null 2>&1; then
      ok "http://$API_HOST:$API_PORT/api/health is 200"
      return 0
    fi
    sleep 2
  done
  return 1
}

# Read-only probe of SurjitWeb (if SURJITWEB_URL is configured): its HTTP
# status, to show it was unaffected. Never used to change anything.
surjitweb_status() {
  local url="$1"
  [ -n "$url" ] || { echo "not-configured"; return; }
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || echo "unreachable"
}

# ── Nginx (root only) ────────────────────────────────────────────────────────

# Reload — never restart — and only after the full configuration validates.
nginx_reload_safely() {
  nginx -t || die "nginx -t failed. nginx was NOT reloaded."
  systemctl reload nginx
  ok "nginx reloaded (not restarted)"
}
