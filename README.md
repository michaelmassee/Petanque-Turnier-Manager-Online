# Petanque Turnier Manager Online

Clean React starter for Cloudflare Workers Static Assets.

## Local development

```bash
npm install
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

For local CLI deploys:

```bash
npm run deploy
```
