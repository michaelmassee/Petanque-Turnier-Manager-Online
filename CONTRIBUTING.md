# Contributing

This is a public repository. Security checks are part of the normal coding flow.

## Test prerequisites

Ranking PDF regression tests use `pdftotext` from Poppler to verify the actual extracted
WinAnsi text, transliteration and page layout. Install `poppler-utils` on Debian/Ubuntu (or `poppler`
with Homebrew on macOS) before running the test suite. CI installs it explicitly.

Ranking PDFs are generated in the browser only after an explicit Postbox send click.
The Worker must not import jsPDF or generate PDFs: large rankings exceed the Free-plan
CPU budget even with standard fonts. Helvetica preserves WinAnsi characters; unsupported
Latin characters are transliterated and remaining unsupported characters become `?`.
The Worker accepts bounded PDF attachments (128 KiB per required language), stores them
once per tournament, and sends metadata-only jobs through the existing mail queue in
blocks of at most 100. The consumer batch size is one. Uploads are restricted to the
authorized tournament owner/editors; administrators remain excluded. The ranking snapshot
revision is checked before dispatch. Blind, at-most-once delivery still does not promise
successful delivery or retries after an email-provider failure.

Migration `0108` must run before deploying this Worker. Personal-data cleanup removes
the stored PDFs as well as recipient addresses but keeps the tournament-wide send lock.

## Commit Checklist

Run before every commit:

```bash
npm run security:check
npm run build
```

Run before push or deployment:

```bash
npm audit --audit-level=high
XDG_CONFIG_HOME=/tmp/wrangler-config npx wrangler deploy --dry-run
```

## Release

Deploy only with `npm run deploy` from `master`. It runs, in order: quality gate, remote D1 migrations,
username backfill (`npm run db:backfill:remote`), `wrangler deploy`, and the backfill again for accounts the
previous Worker created during the rollout. Do not run `wrangler deploy` on its own after a migration that
needs a data backfill. Afterwards verify that the `users` row count is unchanged and that
`SELECT COUNT(*) FROM users WHERE username IS NULL` returns `0`.

## Code Rules

- Keep changes small and reviewable.
- Prefer platform APIs over new dependencies.
- Validate all API input in the Worker before writing D1.
- Enforce authorization in the Worker, not only in React.
- Return public DTOs only; never return raw D1 rows that contain secrets.
- Use migrations for schema changes; do not mutate production data manually from application code.
- Update `README.md` when setup, migration, deployment, environment variables or permissions change.

## Public Repo Rules

- No `.env`, private keys, API tokens, real passwords or real user data.
- No screenshots or fixtures containing private data.
- No generated `dist/`, `.wrangler/`, `node_modules/` or local database state.
