## Security Checklist

- [ ] No secrets, tokens, real passwords, private keys or production data are committed.
- [ ] `npm run security:check` passes.
- [ ] `npm run build` passes.
- [ ] `npm audit --audit-level=high` passes for deployable changes.
- [ ] Worker authorization is enforced server-side for any protected action.
- [ ] D1 migrations are documented and have a remote rollout plan.

## Summary

