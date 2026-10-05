#!/usr/bin/env bash
# Installs or updates ONLY the SurjitLanding nginx site. Run as root
# (sudo) by an administrator, never as part of an app deploy:
#
#   sudo deploy/scripts/nginx-install.sh bootstrap <landing-domain>   # phase 1: HTTP, before the certificate
#   sudo deploy/scripts/nginx-install.sh https     <landing-domain>   # phase 2: HTTPS, after the certificate
#
# Writes exactly two paths:
#   /etc/nginx/sites-available/surjit-landing.conf
#   /etc/nginx/sites-enabled/surjit-landing.conf  (symlink)
# Every other nginx file is fingerprinted before and after and must be
# byte-identical. If `nginx -t` fails, the previous landing file is restored
# (or the new one removed) and nginx is NOT reloaded. Never `restart`.
source "$(dirname "$(readlink -f "$0")")/lib.sh"

PHASE="${1:-}"
DOMAIN="${2:-}"
TEMPLATES="$(dirname "$(readlink -f "$0")")/../nginx"
SITE_AVAILABLE="/etc/nginx/sites-available/surjit-landing.conf"
SITE_ENABLED="/etc/nginx/sites-enabled/surjit-landing.conf"
CERT="/etc/letsencrypt/live/surjit-landing/fullchain.pem"

case "$PHASE" in
  bootstrap) TEMPLATE="$TEMPLATES/surjit-landing.http-bootstrap.conf.template" ;;
  https)     TEMPLATE="$TEMPLATES/surjit-landing.conf.template" ;;
  *) die "usage: nginx-install.sh bootstrap|https <landing-domain>" ;;
esac
[ "$(id -u)" = "0" ] || die "Run with sudo: it writes under /etc/nginx."
[[ "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$ ]] || die "Not a valid domain name: '$DOMAIN'"
[ -f "$TEMPLATE" ] || die "Template not found: $TEMPLATE"

# ── 1. Pre-flight: the existing configuration must already be healthy ──────
info "Checking the existing nginx configuration before changing anything"
nginx -t 2>/dev/null || die "The CURRENT nginx configuration already fails nginx -t. Not adding anything to a broken configuration."
ok "Existing configuration is valid"

# Everything nginx loads, except our own file, for collision checks.
DUMP="$(mktemp)"
trap 'rm -f "$DUMP" "${RENDERED:-}"' EXIT
nginx -T 2>/dev/null >"$DUMP"
OTHER_CONFIG="$(awk -v ours="$SITE_AVAILABLE" -v ours2="$SITE_ENABLED" '
  /^# configuration file / { file = $4; sub(/:$/, "", file); skip = (file == ours || file == ours2) }
  !skip' "$DUMP")"

info "Sites currently enabled (left untouched):"
{ ls -1 /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null || true; } | sed 's/^/    /'

grep -Eq "server_name[^;]*[[:space:]]${DOMAIN//./\\.}[[:space:];]" <<<"$OTHER_CONFIG" \
  && die "Another nginx site already uses server_name $DOMAIN. Not changing anything."
grep -Eq 'zone=surjit_landing_api|log_format[[:space:]]+surjit_landing[[:space:]]' <<<"$OTHER_CONFIG" \
  && die "Another file already declares surjit_landing_api / surjit_landing. Not changing anything."
ok "No other site uses $DOMAIN or the surjit_landing_* names"

if [ "$PHASE" = "https" ]; then
  [ -f "$CERT" ] || die "Certificate $CERT not found. Run certbot certonly --webroot --cert-name surjit-landing first (DEPLOYMENT.md §7)."
  # listen options in nginx 1.24 are per address:port. If another site serves
  # 443 without http2, our `listen 443 ssl http2` would switch HTTP/2 on for
  # that site too — a change to another application. Stop for a decision.
  if grep -E '^[[:space:]]*listen[^;]*443' <<<"$OTHER_CONFIG" | grep -vq 'http2'; then
    [ "${ALLOW_SHARED_443_HTTP2:-}" = "yes" ] \
      || die "Another site listens on 443 without http2. Installing this file would enable HTTP/2 for it as well. Review with the owner of that site; re-run with ALLOW_SHARED_443_HTTP2=yes only after approval."
    warn "Proceeding with HTTP/2 shared on 443 (ALLOW_SHARED_443_HTTP2=yes)."
  fi
fi

# Fingerprint every nginx file except ours (and our own .bak copies), to prove
# afterwards that nothing else changed.
fingerprint() {
  find /etc/nginx -type f ! -path "$SITE_AVAILABLE" ! -path "$SITE_AVAILABLE.bak.*" -print0 | sort -z | xargs -0 sha256sum
  find /etc/nginx -type l ! -path "$SITE_ENABLED" -printf '%p -> %l\n' | sort
}
BEFORE="$(fingerprint)"

# ── 2. Install our file only ─────────────────────────────────────────────────
mkdir -p "$ACME_DIR"
RENDERED="$(mktemp)"
sed "s/LANDING_DOMAIN/$DOMAIN/g" "$TEMPLATE" >"$RENDERED"
grep -q 'LANDING_DOMAIN' "$RENDERED" && die "Template placeholder left unreplaced."

BACKUP=""
if [ -f "$SITE_AVAILABLE" ]; then
  BACKUP="$SITE_AVAILABLE.bak.$(date -u +%Y%m%d-%H%M%S)"
  cp -p "$SITE_AVAILABLE" "$BACKUP"
  info "Previous landing file kept as $BACKUP"
fi
install -m 644 -o root -g root "$RENDERED" "$SITE_AVAILABLE"
ln -sfn "$SITE_AVAILABLE" "$SITE_ENABLED"

# ── 3. Validate; on failure restore and do NOT reload ────────────────────────
if ! nginx -t; then
  if [ -n "$BACKUP" ]; then
    cp -p "$BACKUP" "$SITE_AVAILABLE"
  else
    rm -f "$SITE_ENABLED" "$SITE_AVAILABLE"
  fi
  nginx -t 2>/dev/null && info "Previous configuration restored and valid." \
    || warn "Restored, but nginx -t still fails: investigate before any reload."
  die "nginx -t failed with the landing file. nginx was NOT reloaded; the running nginx is unchanged."
fi

AFTER="$(fingerprint)"
[ "$BEFORE" = "$AFTER" ] || die "Another nginx file changed during installation (should be impossible). NOT reloading. Compare: diff <(echo \"\$BEFORE\") <(echo \"\$AFTER\")"
ok "All other nginx files are byte-identical to before"

nginx_reload_safely

# ── 4. Post-checks ───────────────────────────────────────────────────────────
PROBE="surjit-landing-probe-$$"
mkdir -p "$ACME_DIR/.well-known/acme-challenge"
echo ok >"$ACME_DIR/.well-known/acme-challenge/$PROBE"
code="$(curl -s -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:80:127.0.0.1" "http://$DOMAIN/.well-known/acme-challenge/$PROBE" || true)"
rm -f "$ACME_DIR/.well-known/acme-challenge/$PROBE"
[ "$code" = "200" ] && ok "HTTP challenge path serves from $ACME_DIR" || warn "Challenge probe returned $code"

if [ "$PHASE" = "https" ]; then
  for path in / /api/health; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN$path" || true)"
    [ "$code" = "200" ] && ok "https://$DOMAIN$path is 200" || warn "https://$DOMAIN$path returned $code"
  done
fi

SURJITWEB_URL="$(read_kv "$SHARED_DIR/deploy.env" SURJITWEB_URL)"
[ -z "$SURJITWEB_URL" ] || info "SurjitWeb ($SURJITWEB_URL): $(surjitweb_status "$SURJITWEB_URL") (read-only probe)"
echo
ok "Landing nginx site installed ($PHASE) for $DOMAIN"
