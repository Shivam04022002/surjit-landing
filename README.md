# Surjit Finance — Business Loan Landing Page

A single-page business loan enquiry site with a four-step lead form, its own API and its own database.
It is a standalone project: it shares no code, database, credentials or server configuration with
Surjit Web, the Surjit Finance CMS, LOS, LMS or HRMS.

```
frontend/            React 19 + Vite 7 (JavaScript), React Hook Form, Lucide, Axios
backend/             Node.js + Express 5 + Mongoose 8
deploy/nginx/        HTTP bootstrap + HTTPS site templates (landing domain only)
deploy/scripts/      server scripts: deploy, rollback, nginx-install, backup-db, restore-test
deploy/sitemap.xml.template
DEPLOYMENT.md        isolated staging/production deployment (never touches SurjitWeb)
```

On a server it runs as its own Linux user `surjit-landing`, from `/var/www/surjit-landing/`, as
the PM2 process `surjit-landing-api` in that user's own PM2 daemon, on `127.0.0.1:5050`, with its
own database `surjit_landing` and its own nginx site file. See DEPLOYMENT.md → "Isolation model".

Requires Node.js 20.11 or later (developed on 22.16).

## Run locally

```bash
# 1. API
cd backend
npm install
cp .env.example .env          # then set MONGODB_URI to a local database
npm run dev                   # http://127.0.0.1:5050

# No MongoDB installed? This starts a throwaway in-memory database instead
# (all data is lost when it stops):
npm run dev:memory

# 2. Frontend (second terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173  — /api is proxied to :5050
```

Tests, lint and build:

```bash
cd backend  && npm test && npm run check
cd frontend && npm test && npm run lint && npm run build
```

Backend tests use an in-memory MongoDB and a fake PIN-code provider; they never touch a real
database or the network. `backend/tests/deploySafety.test.js` also checks the deploy files'
isolation guarantees (no `pm2 … all`, no nginx restart, no destructive database command, no
SurjitWeb paths) and runs the guard functions of `deploy/scripts/lib.sh` in bash against stubs.

## The form

| Step | Fields | Rules (enforced in the browser **and** the API) |
|---|---|---|
| 1 Location | PIN Code, State, District, Country | PIN: 6 digits, not starting with 0, digits only. A valid PIN is looked up after 400 ms; State/District/Country are filled and stay editable. Lookup failure never blocks manual entry. Older lookups cannot overwrite newer ones. |
| 2 Loan Details | Desired Loan Amount, Use of Funds | Amount: whole rupees, ₹10,000 to `LOAN_MAX_AMOUNT` (default ₹50,00,000); sent as a number. Use of Funds required. |
| 3 Financial Health | Average Monthly Sale, Business Vintage, Estimated Credit Score | All required, from fixed option values. |
| 4 Business Info | Business Name, Owner Name, Phone, consent | Names required, ≤100 chars, not blank-only. Phone: 10 digits starting 6–9; `+91` is display only. Typed or pasted `+91 98765 43210`, `919876543210` or `09876543210` become `9876543210`; anything else is never shortened into a different number and fails validation. Consent checkbox starts unticked and is required. |

Each step is validated before Continue. Values are kept when going back and forward. Submit is
disabled while sending and repeat clicks are ignored. The success panel (with a reference such as
`SFL-7KQ2MZ4P`) appears only after the API confirms the save. On failure the data is kept, the
error is shown, and server field errors are placed on the right field and step.

**Option values** are shared by `backend/src/constants/leadOptions.js` and
`frontend/src/forms/leadForm/leadFormConfig.js`; a test fails if they diverge.
`averageMonthlySale` uses the reference values (`50k-1.5L`, `1.5L-3L`, `3L-5L`, `5L+`). The original
form's values for Use of Funds, Business Vintage and Credit Score were not available, so this build
defines them (`working-capital`, `lt-1`, `650-750`, …). Reconcile them before any other system
consumes leads.

## API

Every response is `{ success, message, data }` or `{ success: false, message, errors: [{ field, message }] }`.

### `POST /api/leads`
Header `Idempotency-Key`: 16–64 characters `[A-Za-z0-9-]`, one per set of details (the frontend
generates a UUID, keeps it across retries of the same details, and generates a new one if the
visitor changes anything before retrying). The lead stores a SHA-256 fingerprint of the normalised
details, used only to compare a retry with the original. No second copy of the details is kept.

```json
{
  "pinCode": "226001", "state": "Uttar Pradesh", "district": "Lucknow", "country": "India",
  "desiredLoanAmount": 250000, "useOfFunds": "working-capital",
  "averageMonthlySale": "1.5L-3L", "businessVintage": "3-5", "creditScore": "650-750",
  "businessName": "Sharma Traders", "ownerName": "Ravi Sharma", "phoneNumber": "9876543210",
  "consentAccepted": true
}
```

| Status | Meaning |
|---|---|
| 201 | Saved. `data: { reference }` |
| 200 | Same key **and same details** already received: the original lead's `reference` is returned; nothing new is created |
| 400 | Missing/malformed `Idempotency-Key`, or invalid JSON |
| 409 | Same key already used for **different** details: nothing is created or changed, and nothing about the original is returned |
| 413 | Body over 10 kB |
| 422 | Validation failed; `errors[]` names each field |
| 429 | Rate limit (default 10 per IP per hour) |
| 503 | Database unavailable |

### `GET /api/leads/config`
`data: { loanAmount: { min, max } }`. The form uses these bounds, so browser and API always agree.

### `GET /api/pincode/:pincode`
`200 data: { pinCode, state, district, country }` · `400` invalid PIN · `404` unknown PIN ·
`503` provider unavailable · `429` rate limit (60 / 15 min / IP).
Proxies `api.postalpincode.in` (India Post data, no credentials) with a 5 s timeout and an
in-memory cache (24 h for found, 1 h for not found; failures are not cached).

### `POST /api/analytics/events`
`202` accepted (or silently dropped as bot traffic) · `400` not an allowed event · `429` (300 / 15 min / IP).

### `GET /api/health`
`200` when the API and database are up, `503` otherwise.

## Database

A **new** MongoDB database (suggested name `surjit_landing`) used by nothing else, reached with a
user that has `readWrite` on that database only. Indexes are created on startup with
`createIndexes`, which only adds and never drops. Nothing in the code deletes or migrates data.

**`leads`** holds the business record of an enquiry.
`reference` (unique, public), the twelve form fields, `consentAccepted`, `consentAcceptedAt`
(server time), `idempotencyKey` (unique), `requestFingerprint` (SHA-256 hex), `status` (`new`),
`createdAt`, `updatedAt`.
Indexes: `reference` (unique), `idempotencyKey` (unique), `createdAt`.
Deliberately **not** stored: session id, referrer, UTM tags, IP address, user-agent.

**`analyticsevents`** holds anonymous first-party events (see below).
Indexes: `occurredAt` TTL, `{name, occurredAt}`, `{sessionId, occurredAt}`.

### Data retention
- **Analytics events** expire automatically after `ANALYTICS_RETENTION_DAYS` (default 365) via a
  TTL index. If the value is changed after the first deployment, the API **refuses to start** and
  logs `Analytics retention index conflict` with the existing and requested days. It never drops
  or rewrites the index itself. An operator applies an approved change with `collMod`
  (DEPLOYMENT.md → "Changing analytics retention").
- **Leads** have **no automatic expiry**. How long enquiries are kept is a business/legal decision
  and must be agreed before launch.

## Analytics

All first-party: no Google Analytics, Ads or Meta Pixel is included, and no tracking IDs exist.

| Event | When | Detail recorded |
|---|---|---|
| `session_start` | First page view of a new session | referrer host, UTM |
| `page_view` | Page load | referrer host, UTM |
| `form_start` | First interaction with the form | — |
| `form_step_viewed` | A step is shown | `step` |
| `form_step_completed` | A step passes validation (step 4 on confirmed save) | `step` |
| `validation_error` | A field fails validation | `step`, `field` **name** |
| `form_submit_attempted` | Submit sent | — |
| `form_submit_succeeded` | **Only after the API confirms the lead was saved** | — |
| `form_submit_failed` | Submit failed | `reason`: validation / rate_limited / server / network |
| `cta_click` | Apply buttons | `ctaId` |
| `nav_click` | Menu / footer links | `navTarget` |
| `faq_open` | A question is opened | `faqId` |

- **Session:** a random id in `localStorage` (`sfl_session`), expiring after 30 minutes of
  inactivity. It is never attached to a lead.
- **Never sent:** anything typed into the form (names, phone, PIN, amount, option choices), full
  URLs, query strings, IP address, user-agent. The server stores only allowlisted fields, so stray
  properties are dropped. Tests cover both sides.
- **Server-side checks:** event names, page paths, steps, field names, CTA/nav ids and failure
  reasons are allowlists. UTM values must match `[A-Za-z0-9._-+]{1,100}` and must not look like a
  phone number (ten digits, or a mobile with a `91`/`0` prefix, ignoring separators), or they are
  dropped. The browser applies the same filter before sending. Only
  the referrer's host is kept. Device type is derived from the user-agent, which is then discarded.
  Known bots and HTTP libraries are accepted with 202 but not stored.
- **Opt-out:** no events are sent when the browser signals Do Not Track or Global Privacy Control,
  or when built with `VITE_ANALYTICS_ENABLED=false`.
- **Not a business record:** confirmed leads are counted from the `leads` collection, not from
  analytics.

## Security controls

- Helmet headers on the API. Nginx template adds HSTS, a strict CSP, `X-Frame-Options: DENY`,
  `Referrer-Policy` and `Permissions-Policy`.
- CORS allowlist (`CORS_ORIGINS`), with only `GET`/`POST` and the `Content-Type` and
  `Idempotency-Key` headers. Same-origin deployment through Nginx needs no CORS at all.
- Per-IP rate limits on all three public endpoints. Nginx adds a request-rate ceiling.
- JSON body limit of 10 kB at the API and 16 kB at Nginx.
- Server-side validation and normalisation of every field. Unknown fields are ignored, so
  `status`, `reference` and `_id` cannot be set by the client. Markup in names is rejected. React
  renders all text as text.
- Errors never include stack traces, driver messages or environment details. Database outages
  return 503 quickly (Mongoose command buffering is off).
- The access log records method, route **pattern** (e.g. `/api/pincode/:pincode`), status and
  duration only: no IP, user-agent, query string, body or phone number. The Nginx template's log
  format omits query strings.
- Error logs record the error type, the field paths involved and how they failed, never values.
  The message is never logged for Mongoose `ValidationError`/`CastError` or Mongo server errors
  (these can quote a phone number, name or amount). Duplicate-key errors log key names, not
  values, and other errors have long digit runs masked.
- The API binds to `127.0.0.1`. Secrets live only in `.env`, which git ignores, and
  `.env.example` holds placeholders. No credentials from any other project were used.
- The internal Mongo `_id` is never returned; visitors get only the public reference.

### Scaling note
Rate-limit counters and the PIN cache live in process memory, which is correct for the single PM2
instance configured. Running more than one instance would need a shared store (e.g. Redis).

## Content requiring approval

Every item below is marked `CONFIRM:` in `frontend/src/content/siteContent.js`.

1. **"Get instant approval with minimal documentation"** (form subtitle). This is reference copy
   and implies an outcome an enquiry cannot deliver. It should be approved as accurate or replaced
   before launch.
2. **Consent wording and privacy notice** need legal approval, as does the "How are my details
   used?" FAQ answer.
3. **No privacy policy or terms page exists** for this site. The footer has no such links until
   approved pages exist.
4. **Hero headline/description, benefit cards, How It Works steps 2–4, and the follow-up promise**
   ("our team will contact you") are neutral placeholder copy.
5. **Eligibility FAQ**: no criteria are stated until supplied.
6. **Contact details**: none are shown (no verified phone, email or address supplied), so there is
   no contact CTA.
7. **Loan maximum** (`LOAN_MAX_AMOUNT`, default ₹50,00,000) is a placeholder business setting.
8. **Analytics consent position**: anonymous first-party analytics runs without a banner (DNT/GPC
   honoured). Confirm this meets the company's privacy and legal requirements.
9. **Lead retention period**: see "Data retention" above.
10. **Favicon, share image (`og:image`), `og:url`, sitemap** are added once an icon, image and
    domain are approved.

## Differences from the brief

- The supplied `MultiStepLeadForm.jsx` / `.css` and screenshots were not available, so the form was
  built from the written specification and should be compared with the originals when available.
- Navigation is Home / Business Loan / How It Works / FAQs. "About Us" and "Contact" were left out
  because no approved content exists for them.
- Framer Motion was not added; CSS transitions (which honour `prefers-reduced-motion`) cover the
  little animation used.
- The hero visual is a drawn schematic of the four form steps rather than a photo, so no unapproved
  imagery is used and no image download is needed above the fold.
