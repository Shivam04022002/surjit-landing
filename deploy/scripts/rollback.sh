#!/usr/bin/env bash
# Rolls SurjitLanding back to an earlier, already-built release. Run ON THE
# SERVER as the surjit-landing user:
#
#   sudo -iu surjit-landing
#   /var/www/surjit-landing/current/deploy/scripts/rollback.sh            # lists releases
#   /var/www/surjit-landing/current/deploy/scripts/rollback.sh <release>  # e.g. 20261005-120000
#
# Touches only the current symlink and the PM2 process surjit-landing-api in
# the surjit-landing user's own PM2. Never nginx, never SurjitWeb. The
# database is not touched: the schema only ever gains indexes, so code
# rollback needs no database rollback.
source "$(dirname "$(readlink -f "$0")")/lib.sh"

TARGET="${1:-}"
CURRENT_REAL="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"

if [ -z "$TARGET" ]; then
  echo "Releases (newest first):"
  for d in $(ls -1 "$RELEASES_DIR" | sort -r); do
    mark=""
    [ "$RELEASES_DIR/$d" = "$CURRENT_REAL" ] && mark="  <- current"
    echo "  $d  $(cat "$RELEASES_DIR/$d/REVISION" 2>/dev/null || true)$mark"
  done
  echo
  echo "usage: rollback.sh <release>"
  exit 0
fi

[[ "$TARGET" =~ ^[0-9]{8}-[0-9]{6}$ ]] || die "Release names look like 20261005-120000; got: $TARGET"
DIR="$RELEASES_DIR/$TARGET"
assert_landing_path "$DIR"

info "Pre-flight checks"
assert_isolated_pm2
[ -d "$DIR" ] || die "No such release: $DIR"
[ "$DIR" != "$CURRENT_REAL" ] || die "$TARGET is already the current release."
[ -f "$DIR/backend/ecosystem.config.js" ] || die "$DIR has no backend/ecosystem.config.js"
[ -f "$DIR/frontend/dist/index.html" ] || die "$DIR has no built frontend (frontend/dist/index.html)"
[ -L "$DIR/backend/.env" ] && [ "$(readlink -f "$DIR/backend/.env")" = "$SHARED_DIR/.env" ] \
  || die "$DIR/backend/.env must be the symlink to $SHARED_DIR/.env"
[ -d "$DIR/backend/node_modules" ] || die "$DIR has no installed backend dependencies"
ok "Release $TARGET is complete"

SURJITWEB_URL="$(read_kv "$SHARED_DIR/deploy.env" SURJITWEB_URL)"
web_before="$(surjitweb_status "$SURJITWEB_URL")"

info "Switching current → $DIR (was: ${CURRENT_REAL:-none})"
ln -sfn "$DIR" "$LANDING_ROOT/.current.tmp"
mv -Tf "$LANDING_ROOT/.current.tmp" "$CURRENT_LINK"

cd "$CURRENT_LINK/backend"
if landing_exists; then pm2_landing delete; fi
pm2_landing start

verify_running_release || die "PM2 cwd does not match $DIR/backend. Stopped. Inspect: pm2 describe $APP_NAME"
api_health || die "The landing API is not healthy after rollback. Check: pm2 logs $APP_NAME --lines 100"
assert_loopback_listener
pm2_landing save

web_after="$(surjitweb_status "$SURJITWEB_URL")"
info "SurjitWeb: before $web_before, after $web_after (read-only probe)"
[ "$web_after" = "$web_before" ] || warn "SurjitWeb's status changed. This script does not touch SurjitWeb; investigate separately."

echo
ok "Rolled back to $TARGET ($(cat "$DIR/REVISION" 2>/dev/null || true))"
