# Deployment Guide — Surjit Finance Landing Page (SurjitLanding)

Target: a **new EC2 staging server** in AWS Mumbai (`ap-south-1`), Ubuntu Server 24.04 LTS,
Nginx (static site + reverse proxy), PM2 (API), MongoDB database `surjit_landing`.

> **Nothing in this repository deploys anything.** Every step is run by an operator. DNS changes,
> certificate requests and anything on a server that also runs SurjitWeb need explicit sign-off.
>
> **The overriding rule: a SurjitLanding deployment must never interrupt SurjitWeb.** If any check
> below fails or anything is unclear, stop and report. Never "fix" it by changing SurjitWeb.

---

## 0. Isolation model

SurjitLanding shares nothing with SurjitWeb except the machine (if co-hosted) and the nginx
binary. Each separation is enforced, not just named:

| Resource | SurjitLanding | How it is enforced |
|---|---|---|
| Source | its own private repo `surjit-landing` | `deploy.sh` refuses a repo URL naming SurjitWeb |
| Files | `/var/www/surjit-landing/` only | every script path goes through `assert_landing_path`, which refuses anything outside it and anything under `/var/www/surjit-web/` |
| Linux user | `surjit-landing` (no sudo) | owns the landing tree; cannot write SurjitWeb's files |
| PM2 | the `surjit-landing` user's **own PM2 daemon** (`~surjit-landing/.pm2`), one process `surjit-landing-api` | a different user's daemon cannot see or control SurjitWeb's processes; scripts call PM2 only via `pm2_landing`, which allows `delete surjit-landing-api`, `start`, `jlist`, `save` and nothing else; `assert_isolated_pm2` stops if the daemon manages any other process |
| Boot service | `pm2-surjit-landing.service` | separate systemd unit from SurjitWeb's |
| Port | `127.0.0.1:5050` | API refuses to start in production on a non-loopback `HOST`; scripts stop if another process holds 5050; security group never opens it |
| Environment | `/var/www/surjit-landing/shared/.env` (600) | scripts stop unless it is a private regular file pointing at `surjit_landing` on loopback:5050 |
| Database | `surjit_landing`, own users | scripts stop unless `MONGODB_URI` names `surjit_landing` |
| Logs | `/var/www/surjit-landing/shared/logs/`, `/var/log/nginx/surjit-landing.*.log` | |
| Nginx | `/etc/nginx/sites-available/surjit-landing.conf` only | `nginx-install.sh` writes only that file and its symlink, fingerprints every other nginx file before/after, validates with `nginx -t`, restores on failure, only ever `reload`s |
| TLS | certbot lineage `surjit-landing` | `certbot certonly --webroot --cert-name surjit-landing`; certbot never edits nginx files |
| Backups | S3 prefix `surjit-landing/mongodb`, own KMS key | `backup-db.sh` reads only; restores go only to `surjit_landing_restore_test` |

These guarantees are tested: `backend/tests/deploySafety.test.js` fails if any deploy file gains
`pm2 … all`, a PM2 restart/reload/stop, `systemctl restart nginx`, `certbot --nginx`, a
destructive database command, or a SurjitWeb path; it also runs the real guard functions in bash
against stub commands.

### Never run (on any server that runs SurjitWeb)

- ❌ `pm2 restart all`, `pm2 stop all`, `pm2 delete all`, `pm2 kill`, `pm2 update`, `pm2 resurrect`
- ❌ any PM2 command as SurjitWeb's user, or with any process name but `surjit-landing-api`
- ❌ `sudo systemctl restart nginx` / `stop nginx` (only `reload`, only after `nginx -t` passes)
- ❌ `certbot --nginx` or a global `certbot renew --deploy-hook` that restarts anything
- ❌ `npm install -g pm2@…` / upgrading the system Node.js on a server where SurjitWeb runs
- ❌ `ufw enable` / security-group or firewall edits without reviewing SurjitWeb's ports first
- ❌ reinstalling, reconfiguring or restarting a `mongod` that SurjitWeb uses
- ❌ `db.dropDatabase()`, `db.<coll>.drop()`, `mongorestore --drop`, seed/reset scripts on any production database

---

## 1. Decisions to confirm first

| Item | Value used here | Confirmed? |
|---|---|---|
| Server | **new, dedicated** EC2 staging instance (recommended) — or co-hosted with SurjitWeb (see §2) | ☐ |
| Landing domain | `LANDING_DOMAIN` (example only: `enquiry.example.com`) | ☐ |
| MongoDB | self-hosted on the instance, or MongoDB Atlas (Mumbai) | ☐ |
| Private repo | `git@github.com:<owner>/surjit-landing.git` | ☐ |
| Backup bucket / KMS key | `<bucket>`, prefix `surjit-landing/mongodb`, `<kms-key-id>` | ☐ |
| Backup retention | e.g. daily backups kept 35 days (S3 lifecycle) — needs business/legal approval | ☐ |
| Loan maximum | `LOAN_MAX_AMOUNT=5000000` | ☐ |

## 2. Fresh server vs. co-hosting with SurjitWeb

**Recommended: a fresh, dedicated instance.** Nothing of SurjitWeb is on it, so nothing here can
affect it.

**If SurjitLanding is ever co-hosted on SurjitWeb's server**, everything below still applies, plus:

1. Inventory first, read-only: `sudo ss -ltnp`, `ls -l /etc/nginx/sites-enabled /etc/nginx/conf.d`,
   `sudo nginx -T | grep -E 'server_name|listen'`, the SurjitWeb user's `pm2 jlist`, `node -v`,
   `systemctl list-units 'pm2-*'`, `systemctl status mongod`. Record the results.
2. **Stop and report** if: port 5050 is in use; the landing domain appears in any server block;
   SurjitWeb's 443 server blocks do not use `http2` (installing the landing HTTPS file would switch
   HTTP/2 on for them, because nginx 1.24 listen options are per address:port — `nginx-install.sh`
   detects this and stops); SurjitWeb uses the only `mongod` and its configuration would need to
   change (bind address, auth) to host `surjit_landing`; the system Node.js is older than 20.11.
3. Do not install or upgrade anything global (Node.js, PM2, MongoDB packages, nginx). Use `nvm` for
   the `surjit-landing` user's Node.js and a user-local PM2 (§3.3).
4. Do not enable or change the firewall.

## 3. One-time server setup (fresh instance)

### 3.1 AWS

- Instance: Ubuntu Server 24.04 LTS, `ap-south-1`, encrypted EBS root volume, Elastic IP.
- Security group — inbound **only**:

  | Port | Source | Purpose |
  |---|---|---|
  | 22 | administrator IP(s) /32 only | SSH |
  | 80 | 0.0.0.0/0, ::/0 | HTTP (redirect + ACME) |
  | 443 | 0.0.0.0/0, ::/0 | HTTPS |

  **Never open** 5050, 27017, 3000, 4000–4002, 5173 or any other application/database port.
- IAM instance role for backups: `s3:PutObject`/`s3:GetObject` on `arn:aws:s3:::<bucket>/surjit-landing/*`
  and `kms:GenerateDataKey`/`kms:Decrypt` on the backup key only.

### 3.2 Base system (fresh instance only)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git curl
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable   # fresh instance only
# SSH: key-only login; PasswordAuthentication no in /etc/ssh/sshd_config
```

### 3.3 The `surjit-landing` user, Node.js and PM2

```bash
sudo adduser --system --group --shell /bin/bash --home /home/surjit-landing surjit-landing
sudo -iu surjit-landing
  # Node.js 22 LTS for this user only (does not touch a system Node.js)
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  . ~/.nvm/nvm.sh && nvm install 22 && nvm alias default 22
  npm install -g pm2          # installs into this user's nvm prefix, not system-wide
  pm2 jlist                   # [] — this user's own, empty PM2 daemon
  ssh-keygen -t ed25519 -C "surjit-landing deploy key" -f ~/.ssh/id_ed25519 -N ""
  cat ~/.ssh/id_ed25519.pub   # add as a READ-ONLY deploy key on the surjit-landing repo only
exit
# Boot service for this user's PM2 only (creates pm2-surjit-landing.service):
sudo env PATH="$PATH:/home/surjit-landing/.nvm/versions/node/$(sudo -iu surjit-landing bash -lc 'node -v')/bin" \
  pm2 startup systemd -u surjit-landing --hp /home/surjit-landing
```

### 3.4 Directories and permissions

```bash
sudo mkdir -p /var/www/surjit-landing/{releases,shared/logs,acme}
sudo chown -R surjit-landing:surjit-landing /var/www/surjit-landing
sudo chmod 755 /var/www/surjit-landing /var/www/surjit-landing/releases /var/www/surjit-landing/acme
sudo chmod 700 /var/www/surjit-landing/shared          # secrets and logs: landing user only
```

Resulting layout (the app never hard-codes a release directory):

```
/var/www/surjit-landing/
├── current -> /var/www/surjit-landing/releases/<release>   (switched atomically)
├── releases/
│   ├── 20261005-120000/      backend/ (runs from here)  frontend/dist/ (nginx serves this)
│   └── 20261006-090000/
├── shared/                   mode 700, owner surjit-landing
│   ├── .env                  mode 600 — the ONLY place production secrets exist
│   ├── deploy.env            mode 600 — LANDING_REPO_URL, optional SURJITWEB_URL
│   ├── mongodump.yaml        mode 600 — backup user URI
│   ├── mongorestore-test.yaml mode 600 — restore-test user URI
│   ├── backup.env            mode 600 — bucket, prefix, KMS key id
│   └── logs/                 api.out.log, api.err.log
└── acme/                     Let's Encrypt HTTP-01 webroot
```

SurjitWeb, if ever on the same machine, stays in `/var/www/surjit-web/` — never nested in or
sharing anything with `/var/www/surjit-landing/`.

## 4. Database (`surjit_landing`)

**Self-hosted on a fresh instance:** install MongoDB 8 from the official repository; in
`/etc/mongod.conf` keep `net.bindIp: 127.0.0.1` and set `security.authorization: enabled`. Then
create the users (passwords via `passwordPrompt()`, never on the command line):

```javascript
// mongosh as the MongoDB admin user
use surjit_landing
db.createUser({ user: 'landing_app',    pwd: passwordPrompt(), roles: [{ role: 'readWrite', db: 'surjit_landing' }] })
db.createUser({ user: 'landing_backup', pwd: passwordPrompt(), roles: [{ role: 'read',      db: 'surjit_landing' }] })
use surjit_landing_restore_test
db.createUser({ user: 'landing_restore_test', pwd: passwordPrompt(), roles: [{ role: 'readWrite', db: 'surjit_landing_restore_test' }] })
```

**Atlas:** cluster in `ap-south-1`, the same three users scoped to the same databases, network
access for this instance's Elastic IP only.

The API creates its collections (`leads`, `analyticsevents`) and indexes on first start with
`createIndexes` — additive only; it never drops or migrates anything. Never use SurjitWeb's
database, users or connection string.

## 5. Configuration files (`shared/`)

As `surjit-landing` (`sudo -iu surjit-landing`), create each file with `umask 077`:

**`shared/.env`** — from `backend/.env.example`:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `HOST` / `PORT` | `127.0.0.1` / `5050` (anything else is refused) |
| `MONGODB_URI` | `mongodb://landing_app:<password>@127.0.0.1:27017/surjit_landing?authSource=surjit_landing` |
| `CORS_ORIGINS` | `https://LANDING_DOMAIN` |
| `TRUST_PROXY` | `1` |
| `LOAN_MIN_AMOUNT` / `LOAN_MAX_AMOUNT` | `10000` / approved maximum |
| `ANALYTICS_RETENTION_DAYS` | `365` unless otherwise approved |

**`shared/deploy.env`** (no secrets):
```
LANDING_REPO_URL=git@github.com:<owner>/surjit-landing.git
SURJITWEB_URL=https://<surjitweb-domain>/     # optional: read-only "is SurjitWeb still up?" probe
```

**`shared/mongodump.yaml`**, **`shared/mongorestore-test.yaml`**, **`shared/backup.env`**: see §9.

The frontend needs no server-side configuration: it calls `/api` on its own domain, and no
backend value ever reaches the browser bundle.

## 6. First deploy

Before the first deploy, as the administrator: `sudo ss -ltnp | grep ':5050 '` must print nothing.

```bash
sudo -iu surjit-landing
cd /var/www/surjit-landing/releases
git clone git@github.com:<owner>/surjit-landing.git bootstrap   # only to obtain the scripts
bootstrap/deploy/scripts/deploy.sh <tag-or-commit>               # creates releases/<timestamp>, switches current
rm -rf /var/www/surjit-landing/releases/bootstrap                # the bootstrap clone is not a release
```

`deploy.sh` (as `surjit-landing`):

1. **Pre-flight** — own user and own PM2 daemon managing nothing else; directories present;
   `shared/.env` private, pointing at `surjit_landing` on loopback:5050; port 5050 free or already
   the landing API; repo URL is not SurjitWeb's; optional SurjitWeb probe recorded.
2. **Build** — clones the ref into `releases/<UTC timestamp>`, links `backend/.env` →
   `shared/.env`, `npm ci --omit=dev` (backend), `npm ci && npm run build` (frontend).
   Nothing live has changed yet; a failed build stops here.
3. **Switch** — `current` → new release (atomic `mv -T`), then
   `pm2 delete surjit-landing-api` and `pm2 start ecosystem.config.js --env production` from
   `current/backend`.
4. **Verify** — `pm_cwd` must equal `readlink -f current/backend` and be `online`; `/api/health`
   200; port 5050 on loopback only; `pm2 save` (this user's list only); SurjitWeb probe compared.
   **Any failure stops the script with the rollback command; nothing continues or rolls back
   automatically.**

`deploy.sh` never touches nginx: the site is served from `current/frontend/dist`, so switching
`current` is the deploy.

Run tests before tagging a release (`npm test` in `backend/` and `frontend/`); the server installs
production dependencies only.

## 7. Nginx and HTTPS

Run as the administrator from the deployed release. Both phases use `nginx-install.sh`, which:
checks the existing configuration already passes `nginx -t`; lists the enabled sites; stops if the
landing domain or the `surjit_landing*` names exist elsewhere; writes **only**
`/etc/nginx/sites-available/surjit-landing.conf` + its `sites-enabled` symlink; validates with
`nginx -t` (on failure restores the previous landing file or removes the new one, and does **not**
reload); proves every other nginx file is byte-identical; then `systemctl reload nginx` — never
restart — and probes the landing site and (if configured) SurjitWeb.

```bash
cd /var/www/surjit-landing/current
# Phase 1 — HTTP only, so Let's Encrypt can reach the challenge directory:
sudo deploy/scripts/nginx-install.sh bootstrap <landing-domain>
```

Once **DNS for the landing domain points at this instance** (approved cutover only):

```bash
sudo apt install -y certbot        # the plain client; NOT python3-certbot-nginx
sudo certbot certonly --webroot -w /var/www/surjit-landing/acme \
  -d <landing-domain> --cert-name surjit-landing \
  --deploy-hook "nginx -t && systemctl reload nginx"
# Phase 2 — HTTPS site, API proxy and the HTTP→HTTPS redirect:
sudo deploy/scripts/nginx-install.sh https <landing-domain>
sudo certbot renew --dry-run --cert-name surjit-landing
```

The certificate lives in its own lineage (`/etc/letsencrypt/live/surjit-landing/`); no other
certificate is read, replaced or renewed differently. The deploy hook only reloads, and only for
this lineage.

Then: add `og:url` (and an approved `og:image`) to `frontend/index.html`, fill
`deploy/sitemap.xml.template` into `frontend/public/sitemap.xml`, add the `Sitemap:` line to
`frontend/public/robots.txt`, commit, and deploy a new release.

## 8. Updates and rollback

**Update** (as `surjit-landing`): `/var/www/surjit-landing/current/deploy/scripts/deploy.sh <new-tag>`.

**Rollback** (as `surjit-landing`) — affects only SurjitLanding:

```bash
/var/www/surjit-landing/current/deploy/scripts/rollback.sh                    # lists releases, marks current
/var/www/surjit-landing/current/deploy/scripts/rollback.sh 20261005-120000    # previous known-good release
```

It checks the target release is complete (built frontend, installed backend, `.env` symlink),
switches `current`, runs `pm2 delete surjit-landing-api` + `pm2 start ecosystem.config.js --env production`,
verifies `pm_cwd == readlink -f /var/www/surjit-landing/current/backend` and `online`, checks
`/api/health` and loopback-only listening, saves this user's PM2 list, and probes SurjitWeb
read-only. A mismatch stops with a message; it does not continue. No nginx reload is needed and
no database rollback is needed (the schema only ever gains indexes).

Manual check of the running release at any time:

```bash
sudo -iu surjit-landing bash -lc '
  EXPECTED="$(readlink -f /var/www/surjit-landing/current/backend)"
  pm2 jlist | node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const a=JSON.parse(s).find(p=>p.name===\"surjit-landing-api\");console.log(a?a.pm2_env.pm_cwd+\" \"+a.pm2_env.status:\"not running\")})"
  echo "expected: $EXPECTED"'
```

Keep at least the two previous releases; remove older ones by hand.

### Changing analytics retention

The 365-day analytics expiry is a MongoDB TTL index. If `ANALYTICS_RETENTION_DAYS` changes after
the first deployment, the API **refuses to start** and logs `Analytics retention index conflict`
with the existing and requested days (PM2 backs off; it does not loop tightly). It never changes the
index itself. Once a change is approved, an operator updates the index in place — no documents are
removed by this command; documents older than the new period then expire as normal, which is why
shortening retention needs the same approval as any deletion:

```javascript
// mongosh, landing database, as a user allowed to run collMod
db.runCommand({ collMod: 'analyticsevents', index: { name: 'occurredAt_ttl', expireAfterSeconds: <days * 86400> } })
```

## 9. Backups (`surjit_landing`)

| | |
|---|---|
| What | full `mongodump` of `surjit_landing` (leads + analytics), gzip archive + SHA-256 |
| Frequency | daily at 02:00 IST (systemd timer below) — confirm |
| Destination | `s3://<bucket>/surjit-landing/mongodb/`, **SSE-KMS** with a dedicated key, bucket private, versioning on, TLS in transit |
| Retention | S3 lifecycle rule on the prefix, e.g. 35 days — **needs business/legal approval** together with lead retention |
| Who can read | the instance role (put/get on this prefix) and named administrators only |
| Restore test | monthly, and before go-live: `restore-test.sh` into `surjit_landing_restore_test` |

Configuration (as `surjit-landing`, mode 600):

```
# shared/mongodump.yaml
uri: mongodb://landing_backup:<password>@127.0.0.1:27017/surjit_landing?authSource=surjit_landing
# shared/mongorestore-test.yaml
uri: mongodb://landing_restore_test:<password>@127.0.0.1:27017/surjit_landing_restore_test?authSource=surjit_landing_restore_test
# shared/backup.env
BACKUP_S3_BUCKET=<bucket>
BACKUP_S3_PREFIX=surjit-landing/mongodb
BACKUP_KMS_KEY_ID=<kms-key-arn>
```

Install the MongoDB Database Tools and AWS CLI, then a timer for the landing user only:

```ini
# /etc/systemd/system/surjit-landing-backup.service
[Service]
Type=oneshot
User=surjit-landing
ExecStart=/var/www/surjit-landing/current/deploy/scripts/backup-db.sh

# /etc/systemd/system/surjit-landing-backup.timer
[Timer]
OnCalendar=*-*-* 20:30:00 UTC
Persistent=true
[Install]
WantedBy=timers.target
```

`sudo systemctl daemon-reload && sudo systemctl enable --now surjit-landing-backup.timer`, then run
it once by hand: `sudo systemctl start surjit-landing-backup.service` and check
`journalctl -u surjit-landing-backup`.

**Restore test** (non-destructive): `restore-test.sh surjit_landing-<timestamp>.archive.gz`
downloads the archive, verifies its checksum and restores it **only** into
`surjit_landing_restore_test` (renamed with `--nsFrom/--nsTo`, never `--drop`). Compare counts:

```javascript
// mongosh
db.getSiblingDB('surjit_landing').leads.countDocuments()
db.getSiblingDB('surjit_landing_restore_test').leads.countDocuments()
```

Removing the test database afterwards is a deliberate, manual step by the MongoDB administrator,
after double-checking the name is `surjit_landing_restore_test`.

**Real restore** (disaster recovery only, with approval): restore into a new database name, verify
it, then point `MONGODB_URI` at it and redeploy. Never restore over, drop or rename the live
`surjit_landing` database.

## 10. Staging verification checklist

- [ ] SurjitWeb source, PM2 processes, nginx files and database untouched (if co-hosted: compare
      with the §2 inventory; `nginx-install.sh` reports other nginx files byte-identical)
- [ ] `surjit-landing` repository is private; no secrets in its history (`git log -p | grep` for keys)
- [ ] Landing directory, `.env`, database, PM2 daemon/process and nginx site are separate (§0)
- [ ] Security group: only 22 (admin IP), 80, 443; `sudo ss -ltnp` shows 5050 and 27017 on 127.0.0.1 only
- [ ] `nginx -t` passes; only `reload` was used
- [ ] `deploy.sh` reported `pm_cwd` = `readlink -f current/backend`
- [ ] `curl -s https://<domain>/api/health` → `{"success":true,…}`
- [ ] `https://<domain>/` loads; `http://` redirects to `https://`; headers: HSTS, CSP, nosniff
- [ ] Form: all four steps, PIN lookup (`226001` → Lucknow, Uttar Pradesh), lead created with a reference
- [ ] Idempotency: the same request twice → one lead (README → API)
- [ ] Analytics events stored with no form values (`db.analyticsevents.findOne()`)
- [ ] SurjitWeb still reachable throughout
- [ ] Rollback tested: deploy a second release, `rollback.sh <first>`, verify, deploy forward again
- [ ] Backup run once by hand; restore test done; counts match
- [ ] Real Android phone, iPhone, tablet and desktop checked
