# Security Policy

This repository is public. Treat every committed byte as permanently public.

## Supported Surface

- Cloudflare Worker API in `src/worker.js`
- React/PWA frontend in `src/`
- D1 migrations in `migrations/`
- Cloudflare configuration in `wrangler.jsonc`

## Required Rules for Every Commit

Before committing, run:

```bash
npm run security:check
npm run build
```

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
- Dependencies must stay minimal. New dependencies require a reason and `npm audit --audit-level=high`.

## Current Security Controls

- HTTP-only, `Secure`, `SameSite=Lax` session cookies.
- PBKDF2 password hashing with per-password random salt.
- Password reset tokens are hashed in D1 and expire after 30 minutes.
- Login is rate-limited: `/api/login` rejects with `429` after 5 failed attempts per email or 20 per IP within a 15-minute window; a successful login clears the counter for that email.
- API responses use `Cache-Control: no-store`.
- Worker responses include CSP, frame, referrer, permissions and MIME-sniffing headers.
- Static assets define the same browser security headers in `public/_headers`.
- Wrangler routes `/api/*` through the Worker first.
- Mutating API requests are rejected when an `Origin` header is present and not same-origin.
- Role checks keep user management and tournament management separate.
- Public registrations are only accepted for public tournaments with status `registration`.
- Programmatic access (external tournament-management software) requires an approved API key (`Authorization: Bearer ptm_...`). Keys start in status `pending` and only work once an admin explicitly approves them (`/api/admin/api-keys/{id}/approve`) — unapproved or revoked keys are rejected with `401`.
- API key secrets are never stored in plaintext beyond the single retrieval window: only a SHA-256 hash is kept for authentication, and the plaintext secret is deleted from the database as soon as the owning turnierleiter retrieves it once (`/api/api-keys/{id}/secret`, `410` on repeat).
- API-key-authenticated requests are scoped the same way as session requests: `canManageTournament()` still restricts access to the caller's own tournaments; API keys cannot manage users.

## Secret Handling

Use Cloudflare secrets for production:

```bash
wrangler secret put RESEND_API_KEY
wrangler secret put MAIL_FROM
```

Local development may use an ignored `.env` file. Do not copy real production
secrets into examples, screenshots, issues or test fixtures.

## Reporting Security Issues

Do not open public GitHub issues for vulnerabilities. Contact the repository
owner privately and include:

- affected URL or code path,
- impact,
- reproduction steps,
- suggested mitigation if known.
