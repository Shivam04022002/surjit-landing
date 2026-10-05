#!/usr/bin/env bash
# Deploys one SurjitLanding release. Run ON THE SERVER as the surjit-landing
# user, from any existing checkout of this repository:
#
#   sudo -iu surjit-landing
#   /var/www/surjit-landing/current/deploy/scripts/deploy.sh <git-ref>
#
# <git-ref> is a tag or commit SHA that has passed tests locally/in CI.
#
# What it touches — and nothing else:
#   · a new directory under /var/www/surjit-landing/releases/
#   · the /var/www/surjit-landing/current symlink (switched atomically)
#   · the PM2 process surjit-landing-api in the surjit-landing user's own PM2
# It never touches nginx (the site is served from current/ automatically),
# never another PM2 process, and never anything under /var/www/surjit-web.
#
# Any failed check STOPs with a message. Nothing continues automatically and
# nothing is rolled back automatically: see DEPLOYMENT.md → Rollback.
source "$(dirname "$(readlink -f "$0")")/lib.sh"

REF="${1:-}"
[ -n "$REF" ] || die "usage: deploy.sh <git tag or commit SHA>"
[[ "$REF" =~ ^[A-Za-z0-9._/-]+$ ]] || die "Invalid git ref: $REF"

DEPLOY_ENV="$SHARED_DIR/deploy.env"
REPO_URL="$(read_kv "$DEPLOY_ENV" LANDING_REPO_URL)"
SURJITWEB_URL="$(read_kv "$DEPLOY_ENV" SURJITWEB_URL)"

# ── 1. Pre-flight ────────────────────────────────────────────────────────────
info "Pre-flight checks"
assert_isolated_pm2
for d in "$LANDING_ROOT" "$RELEASES_DIR" "$SHARED_DIR" "$SHARED_DIR/logs"; do
  assert_landing_path "$d"
  [ -d "$d" ] || die "Missing directory $d (see DEPLOYMENT.md → One-time server setup)."
done
[ -n "$REPO_URL" ] || die "LANDING_REPO_URL is not set in $DEPLOY_ENV."
case "$REPO_URL" in
  *SurjitWeb* | *surjitweb* | *surjit-web*) die "LANDING_REPO_URL points at SurjitWeb's repository: $REPO_URL" ;;
esac

ENV_FILE="$SHARED_DIR/.env"
[ -f "$ENV_FILE" ] && [ ! -L "$ENV_FILE" ] || die "$ENV_FILE must exist as a regular file (not a symlink)."
[ "$(stat -c '%a' "$ENV_FILE")" = "600" ] || die "$ENV_FILE must be mode 600 (chmod 600 $ENV_FILE)."
[ "$(stat -c '%U' "$ENV_FILE")" = "$LANDING_USER" ] || die "$ENV_FILE must be owned by $LANDING_USER."
grep -qE "^MONGODB_URI=.*/${LANDING_DB}([?\"]|$)" "$ENV_FILE" \
  || die "MONGODB_URI in $ENV_FILE must point at the '$LANDING_DB' database."
env_host="$(read_kv "$ENV_FILE" HOST)"
[ -z "$env_host" ] || [ "$env_host" = "127.0.0.1" ] || [ "$env_host" = "::1" ] || [ "$env_host" = "localhost" ] \
  || die "HOST in $ENV_FILE must be loopback (127.0.0.1), not $env_host."
env_port="$(read_kv "$ENV_FILE" PORT)"
[ -z "$env_port" ] || [ "$env_port" = "$API_PORT" ] || die "PORT in $ENV_FILE must be $API_PORT, not $env_port."
ok "shared/.env is separate, private and points at $LANDING_DB on loopback:$API_PORT"

case "$(port_owner)" in
  free | landing) ok "Port $API_PORT is free or already the landing API" ;;
  *) die "Port $API_PORT is in use by another process. Not changing anything: resolve the collision first (never by moving SurjitWeb)." ;;
esac

web_before="$(surjitweb_status "$SURJITWEB_URL")"
info "SurjitWeb before deploy: $web_before (read-only probe)"

# ── 2. Build the new release (nothing live changes yet) ──────────────────────
RELEASE="$(date -u +%Y%m%d-%H%M%S)"
DIR="$RELEASES_DIR/$RELEASE"
assert_landing_path "$DIR"
[ ! -e "$DIR" ] || die "$DIR already exists."

info "Fetching $REF into $DIR"
git clone --quiet "$REPO_URL" "$DIR"
git -C "$DIR" -c advice.detachedHead=false checkout --quiet "$REF"
SHA="$(git -C "$DIR" rev-parse --short HEAD)"
echo "$REF $SHA" >"$DIR/REVISION"

ln -s "$ENV_FILE" "$DIR/backend/.env"

info "Installing backend production dependencies"
(cd "$DIR/backend" && npm ci --omit=dev --no-audit --no-fund)
info "Building frontend"
(cd "$DIR/frontend" && npm ci --no-audit --no-fund && npm run build)
[ -f "$DIR/frontend/dist/index.html" ] || die "Frontend build produced no dist/index.html. current was NOT switched."
ok "Release $RELEASE ($SHA) built"

# ── 3. Switch and restart the landing API only ───────────────────────────────
PREVIOUS="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
info "Switching current → $DIR (previous: ${PREVIOUS:-none})"
ln -sfn "$DIR" "$LANDING_ROOT/.current.tmp"
mv -Tf "$LANDING_ROOT/.current.tmp" "$CURRENT_LINK"

cd "$CURRENT_LINK/backend"
if landing_exists; then pm2_landing delete; fi
pm2_landing start

# ── 4. Verify; stop on any failure ───────────────────────────────────────────
ROLLBACK_HINT="To return to the previous release: deploy/scripts/rollback.sh $(basename "${PREVIOUS:-<previous-release>}")"
verify_running_release || die "$ROLLBACK_HINT"
api_health || die "The landing API is not healthy. Deployment stopped. $ROLLBACK_HINT"
assert_loopback_listener
pm2_landing save
ok "PM2 process list of $LANDING_USER saved"

web_after="$(surjitweb_status "$SURJITWEB_URL")"
info "SurjitWeb after deploy: $web_after (before: $web_before)"
[ "$web_after" = "$web_before" ] || warn "SurjitWeb's status changed during the deploy. This script does not touch SurjitWeb; investigate separately."

echo
ok "Deployed $REF ($SHA) as release $RELEASE"
echo "    Previous release: ${PREVIOUS:-none}"
echo "    Releases are kept; remove old ones manually when no longer needed for rollback."
