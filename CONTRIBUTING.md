# Contributing

This is a public repository. Security checks are part of the normal coding flow.

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
