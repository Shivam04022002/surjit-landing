#!/usr/bin/env bash
# Backs up the surjit_landing database to S3, encrypted with KMS. Run ON THE
# SERVER as the surjit-landing user, from a systemd timer (DEPLOYMENT.md §9):
#
#   /var/www/surjit-landing/current/deploy/scripts/backup-db.sh
#
# Reads only. It never drops, restores or deletes anything in MongoDB, and it
# never deletes backups (retention is an S3 lifecycle rule).
#
# Configuration (all in /var/www/surjit-landing/shared, mode 600, owner surjit-landing):
#   mongodump.yaml   `uri: mongodb://landing_backup:<password>@127.0.0.1:27017/surjit_landing?authSource=surjit_landing`
#                    (a user with only the `read` role on surjit_landing). A config
#                    file keeps the password out of the process list.
#   backup.env       BACKUP_S3_BUCKET=…  BACKUP_S3_PREFIX=surjit-landing/mongodb  BACKUP_KMS_KEY_ID=…
source "$(dirname "$(readlink -f "$0")")/lib.sh"

[ "$(id -un)" = "$LANDING_USER" ] || die "Run as $LANDING_USER."
for tool in mongodump aws sha256sum; do
  command -v "$tool" >/dev/null || die "$tool is not installed."
done

CFG="$SHARED_DIR/mongodump.yaml"
ENV="$SHARED_DIR/backup.env"
for f in "$CFG" "$ENV"; do
  assert_landing_path "$f"
  [ -f "$f" ] || die "Missing $f"
  [ "$(stat -c '%a' "$f")" = "600" ] || die "$f must be mode 600."
done
grep -qE "^uri:.*/${LANDING_DB}([?\"' ]|$)" "$CFG" || die "$CFG must point at the $LANDING_DB database only."

BUCKET="$(read_kv "$ENV" BACKUP_S3_BUCKET)"
PREFIX="$(read_kv "$ENV" BACKUP_S3_PREFIX)"
KMS_KEY="$(read_kv "$ENV" BACKUP_KMS_KEY_ID)"
[ -n "$BUCKET" ] && [ -n "$PREFIX" ] && [ -n "$KMS_KEY" ] || die "BACKUP_S3_BUCKET, BACKUP_S3_PREFIX and BACKUP_KMS_KEY_ID are required in $ENV."

umask 077
TMP="$SHARED_DIR/backup-tmp"
assert_landing_path "$TMP"
mkdir -p "$TMP"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$TMP/${LANDING_DB}-${STAMP}.archive.gz"
trap 'rm -f "$FILE" "$FILE.sha256"' EXIT

info "Dumping $LANDING_DB"
mongodump --config="$CFG" --archive="$FILE" --gzip --quiet
[ -s "$FILE" ] || die "The dump is empty."
(cd "$TMP" && sha256sum "$(basename "$FILE")" >"$FILE.sha256")

DEST="s3://$BUCKET/$PREFIX/$(basename "$FILE")"
info "Uploading to $DEST (SSE-KMS)"
aws s3 cp "$FILE" "$DEST" --sse aws:kms --sse-kms-key-id "$KMS_KEY" --only-show-errors
aws s3 cp "$FILE.sha256" "$DEST.sha256" --sse aws:kms --sse-kms-key-id "$KMS_KEY" --only-show-errors
aws s3api head-object --bucket "$BUCKET" --key "$PREFIX/$(basename "$FILE")" --query ServerSideEncryption --output text \
  | grep -q 'aws:kms' || die "Uploaded object is not KMS-encrypted."

ok "Backup $(basename "$FILE") ($(stat -c '%s' "$FILE") bytes) stored encrypted at $DEST"
# The local copy is removed by the EXIT trap: backups live only in S3.
