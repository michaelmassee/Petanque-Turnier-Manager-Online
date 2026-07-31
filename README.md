# Petanque Turnier Manager Online

React app for Cloudflare Workers Static Assets with a Worker API, D1 database,
login, password reset flow, role-based user management, tournament management,
public registrations and installable PWA shell.

Roles:

- Admin
- User
- Turnierleiter

Languages:

- DE
- NL
- EN
- ES
- FR

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

## Features

- User management with Admin, User and Turnierleiter roles
- Tournament CRUD managed directly in PTM Online
- Public tournament list and public registration form
- Registration management with pending, confirmed, waitlist and cancelled states
- Installable mobile PWA with manifest, app icon and service worker
- Runtime language switcher for DE/NL/EN/ES/FR

## Cloudflare

Connect this repository in the Cloudflare dashboard and use:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Output directory: `dist`

Apply the D1 migration before first production use:

```bash
npm run db:migrate:remote
```

When new migrations are added, run the same command again before using the new
feature in production.

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
