# Security Policy

This repository is public. Treat every committed byte as permanently public.

## Supported Surface

- Cloudflare Worker API in `src/worker.js`
- React/PWA frontend in `src/`
- D1 migrations in `migrations/`
- Cloudflare configuration in `wrangler.jsonc`

## Required Rules for Every Commit

The checks are enforced, not optional:

- **Pre-commit hook:** `.githooks/pre-commit` runs `npm run quality-gate` (lint, build,
  tests with coverage gate, `security:check`, `npm audit --audit-level=high`) and blocks
  the commit on failure. `npm install` activates it via `postinstall`
  (`git config core.hooksPath .githooks`).
- **CI:** `.github/workflows/quality-gate.yml` runs the same gate on every push to
  `master` and every pull request. The hook can be skipped locally with `--no-verify`;
  CI cannot, so it is the authoritative gate. `master` should require this check via
  branch protection.
- **Deploy:** `npm run deploy` runs the quality gate again before migrating and deploying.

Before pushing a deployable change, also run:

```bash
npm audit --audit-level=high
XDG_CONFIG_HOME=/tmp/wrangler-config npx wrangler deploy --dry-run
```

Commits must follow these rules:

- Never commit secrets, tokens, passwords, private keys, real customer data, production exports or local `.env` files.
- Never commit Cloudflare account IDs, API tokens, D1 credentials or email provider secrets unless the value is documented public metadata.
- Keep secret names in code, but store secret values only in Cloudflare secrets or local ignored `.env` files.
- Any authentication, authorization, session, password, registration or payment-related change needs a focused security review before merge.
- Any D1 migration must be forward-only, idempotent where possible and documented in `README.md`.
- Public endpoints must explicitly document whether anonymous access is intended.
- API responses must not expose password hashes, salts, reset token hashes, session IDs or internal notes to unauthorized users.
- Browser-facing code must not use `dangerouslySetInnerHTML` unless the input is generated locally and reviewed.
- All D1 queries must use bound parameters (`.prepare('... ?').bind(value)`). Never interpolate request data into SQL strings; dynamic SQL may only generate `?` placeholders or pick identifiers from a hard-coded allowlist.
- Every API endpoint must validate request input on the server (type, length, allowed values/format) and reject invalid input with `400`. Client-side validation is convenience only.
- User-supplied URLs must be restricted to `http:`/`https:` on the server (`isHttpUrl`) before being stored or rendered as `href`/`src`.
- Rich text is stored as whitelisted TipTap JSON (`src/lib/rich-text.js`) and rendered as React elements, never as raw HTML.
- Request bodies must be read through `readJson()` (or `readBodyWithLimit()` in `src/worker-core.js`), never via `request.json()`/`request.text()` directly, so the size limit applies. Outbound fetches whose response body the Worker reads or forwards must also use a byte limit.
- Browser security headers are defined only in `SECURITY_HEADERS` in `src/worker.js`. Do not add security headers to `public/_headers`; the Worker overrides them and a second copy only drifts.
- Dependencies must stay minimal. New dependencies require a reason and `npm audit --audit-level=high`.

## Current Security Controls

- HTTP-only, `Secure`, `SameSite=Lax` session cookies.
- PBKDF2 password hashing with per-password random salt.
- Password reset tokens are hashed in D1 and expire after 30 minutes.
- Login is rate-limited: `/api/login` rejects with `429` after 5 failed attempts per email or 20 per IP within a 15-minute window; a successful login clears the counter for that email.
- Login for unknown email addresses still runs PBKDF2 against a dummy hash, so response timing does not reveal whether an account exists.
- Further IP rate limits: geocoding (30 per 15 minutes), anonymous tournament reports and boule-place reports (5 per hour each).
- Anonymous tournament and boule-place reports require a Cloudflare Turnstile token verified on the server.
- Google and Facebook OAuth use a short-lived, HTTP-only `state` cookie scoped to the respective callback path.
- JSON request bodies are limited to 1 MiB (`MAX_JSON_BODY_BYTES`); larger bodies are rejected with `413`. The limit is enforced while streaming, so a missing or false `Content-Length` does not bypass it.
- API responses use `Cache-Control: no-store`.
- Worker responses include CSP, frame, referrer, permissions and MIME-sniffing headers.
- `run_worker_first` routes every request, including static assets, through the Worker, which applies `SECURITY_HEADERS` to all responses.
- Mutating API requests are rejected when an `Origin` header is present and not same-origin.
- No CORS: the Worker sends no `Access-Control-*` headers, so browsers cannot call the API cross-origin. Frontend and API are served from the same origin by design. External clients (tournament-management software) are not browsers and authenticate with API keys instead of cookies. If frontend and API are ever split across origins, CORS must be introduced as an explicit origin allowlist, never `*` combined with credentials.
- External images (tournament logos/flyers, club logos) are proxied through the Worker so the CSP can keep `img-src 'self'`. The proxy only accepts stored `http:`/`https:` URLs, rejects loopback/private hosts, does not follow redirects, requires an `image/*` content type, times out after 8 seconds and aborts bodies over 8 MiB even without `Content-Length`.
- Role checks keep user management and tournament management separate.
- Public registrations are only accepted for public tournaments with status `registration`.
- Programmatic access (external tournament-management software) requires an approved API key (`Authorization: Bearer ptm_...`). Keys start in status `pending` and only work once an admin explicitly approves them (`/api/admin/api-keys/{id}/approve`) — unapproved or revoked keys are rejected with `401`.
- API key secrets are never stored in plaintext beyond the single retrieval window: only a SHA-256 hash is kept for authentication, and the plaintext secret is deleted from the database as soon as the owning turnierleiter retrieves it once (`/api/api-keys/{id}/secret`, `410` on repeat).
- API-key-authenticated requests are scoped the same way as session requests: `canManageTournament()` still restricts access to the caller's own tournaments; API keys cannot manage users.

## Secret Handling

Use Cloudflare secrets for production:

```bash
wrangler secret put STRATO_SMTP_USER
wrangler secret put STRATO_SMTP_PASSWORD
wrangler secret put RESEND_API_KEY
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put FACEBOOK_APP_SECRET
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put MAPTILER_API_KEY
wrangler secret put BASIC_AUTH_PASSWORD   # optional, only for a password-protected staging setup
```

Public values that may live in `wrangler.jsonc` `vars`: `MAIL_FROM`,
`STRATO_MAIL_FROM`, `TURNSTILE_SITE_KEY`, `GOOGLE_CLIENT_ID`, `FACEBOOK_APP_ID`,
`VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`. `MAPTILER_API_KEY` is delivered to the browser
for map tiles, so it must be restricted to the production domains in the MapTiler
dashboard; it is kept as a secret only to stay out of the public repository.

Email delivery is routed per recipient between Strato SMTP and Resend, with
automatic fallback to the other provider if the first one is unreachable,
misconfigured, or rejects the send.

Local development may use an ignored `.env` file. Do not copy real production
secrets into examples, screenshots, issues or test fixtures.

## Reporting Security Issues

Do not open public GitHub issues for vulnerabilities. Contact the repository
owner privately and include:

- affected URL or code path,
- impact,
- reproduction steps,
- suggested mitigation if known.
