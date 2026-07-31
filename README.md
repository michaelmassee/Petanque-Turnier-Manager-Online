# Petanque Turnier Manager Online

React app for Cloudflare Workers Static Assets with a small Worker API, D1 user
database, login, password reset flow and role-based user management.

Roles:

- Admin
- User
- Turnierleiter

## Local development

```bash
npm install
npm run db:migrate:local
npm run dev
```

## Build

```bash
npm run build
```

The production build is written to `dist/`.

## Cloudflare

Connect this repository in the Cloudflare dashboard and use:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Output directory: `dist`

Apply the D1 migration before first production use:

```bash
npm run db:migrate:remote
```

For local CLI deploys:

```bash
npm run deploy
```

## Password reset emails

Password reset tokens are stored in D1. For production email delivery, configure
these Worker secrets or variables:

- `RESEND_API_KEY`
- `MAIL_FROM`

Without those values, reset links are logged by the Worker. During local
development on `localhost` or `127.0.0.1`, the reset URL is also returned in the
API response for testing.
