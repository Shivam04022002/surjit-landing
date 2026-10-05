#!/usr/bin/env bash
# Restore TEST: proves a backup can be restored, without touching the live
# database. Run ON THE SERVER as the surjit-landing user:
#
#   /var/www/surjit-landing/current/deploy/scripts/restore-test.sh <backup-file-name>
#   e.g. restore-test.sh surjit_landing-20261005T020000Z.archive.gz
#
# The backup is restored ONLY into the separate database
# surjit_landing_restore_test (renamed with --nsFrom/--nsTo), never into
# surjit_landing, and never with --drop. If that test database already holds
# the same documents, mongorestore reports duplicate-key errors instead of
# overwriting anything. Removing the test database afterwards is a manual,
# reviewed step (DEPLOYMENT.md §9) — this script deletes nothing in MongoDB.
#
# Configuration (shared/, mode 600):
#   mongorestore-test.yaml  `uri: mongodb://landing_restore_test:<password>@127.0.0.1:27017/surjit_landing_restore_test?authSource=surjit_landing_restore_test`
#                           (a user whose only role is readWrite on surjit_landing_restore_test)
#   backup.env              as for backup-db.sh
source "$(dirname "$(readlink -f "$0")")/lib.sh"

readonly TEST_DB="surjit_landing_restore_test"
NAME="${1:-}"
[[ "$NAME" =~ ^${LANDING_DB}-[0-9]{8}T[0-9]{6}Z\.archive\.gz$ ]] || die "usage: restore-test.sh ${LANDING_DB}-YYYYMMDDTHHMMSSZ.archive.gz"
[ "$(id -un)" = "$LANDING_USER" ] || die "Run as $LANDING_USER."
for tool in mongorestore aws sha256sum; do
  command -v "$tool" >/dev/null || die "$tool is not installed."
done

CFG="$SHARED_DIR/mongorestore-test.yaml"
ENV="$SHARED_DIR/backup.env"
for f in "$CFG" "$ENV"; do
  assert_landing_path "$f"
  [ -f "$f" ] || die "Missing $f"
  [ "$(stat -c '%a' "$f")" = "600" ] || die "$f must be mode 600."
done
# The restore target must be the test database — never the live one.
grep -qE "^uri:.*/${TEST_DB}([?\"' ]|$)" "$CFG" || die "$CFG must point at $TEST_DB."
grep -qE "^uri:.*/${LANDING_DB}([?\"' ]|$)" "$CFG" && die "$CFG points at the live $LANDING_DB database. Refusing."

BUCKET="$(read_kv "$ENV" BACKUP_S3_BUCKET)"
PREFIX="$(read_kv "$ENV" BACKUP_S3_PREFIX)"

umask 077
TMP="$SHARED_DIR/backup-tmp"
assert_landing_path "$TMP"
mkdir -p "$TMP"
FILE="$TMP/$NAME"
trap 'rm -f "$FILE" "$FILE.sha256"' EXIT

info "Downloading s3://$BUCKET/$PREFIX/$NAME"
aws s3 cp "s3://$BUCKET/$PREFIX/$NAME" "$FILE" --only-show-errors
aws s3 cp "s3://$BUCKET/$PREFIX/$NAME.sha256" "$FILE.sha256" --only-show-errors
(cd "$TMP" && sha256sum -c "$NAME.sha256") || die "Checksum mismatch: the backup is corrupt."

info "Restoring into $TEST_DB (live $LANDING_DB is not touched; no --drop)"
mongorestore --config="$CFG" --archive="$FILE" --gzip \
  --nsInclude="${LANDING_DB}.*" --nsFrom="${LANDING_DB}.*" --nsTo="${TEST_DB}.*" 2>&1 | tail -n 5

ok "Restore test finished. Compare the restored counts with the live database (DEPLOYMENT.md §9)."
