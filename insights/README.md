# Insights

Hard-won debugging knowledge from building Rental Platform OS. These are things that took hours to figure out and would take hours again without documentation.

Each topic gets its own directory so it can grow (additional files, screenshots, code samples) without bloating a single file.

## Index

| Directory                                              | Topic                        | TL;DR                                                                                                                                                           |
| ------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [workos-authkit-nextjs16/](workos-authkit-nextjs16/)   | WorkOS AuthKit on Next.js 16 | `src/proxy.ts` not `middleware.ts`, `initialAuth` pattern, header flow                                                                                          |
| [convex-workos-auth/](convex-workos-auth/)             | Convex + WorkOS auth chain   | Use `ctx.auth.getUserIdentity()`, not `authKit.getAuthUser()` in local dev                                                                                      |
| [docker-playwright-mcp/](docker-playwright-mcp/)       | Docker Playwright MCP        | Issue 1: Add `--host 0.0.0.0` (loopback binding). Issue 2: Convex WebSocket patch (`127.0.0.1:3210` unreachable from Docker — monkey-patch via `addInitScript`) |
| [workos-dev-user-seeding/](workos-dev-user-seeding/)   | WorkOS Dev User Seeding      | Dev login fails silently if WorkOS user doesn't exist. Use `npm run seed:dev` (not `npm run seed`) for fresh environments.                                      |
| [convex-dev-push-blockers/](convex-dev-push-blockers/) | Convex Dev Push Blockers     | 3 issues that block `npx convex dev`: stale schema keys, OpenAI v6 removed exports, pre-existing test TS errors. Use `--typecheck=disable` for quick unblock.   |
| [p44-ops-superset-rollout/](p44-ops-superset-rollout/) | P44 Rollout Operations       | Config-only launch/rollback runbook for OPS field-worker rollout, including checkpoints and incident comms template.                                            |

## When to Read This

**If you've been stuck on a bug for 15+ minutes**, check here first. Someone may have already solved it.

Common triggers:

- Auth isn't working after login
- Proxy/middleware not running
- Convex queries returning null for authenticated users
- WorkOS session exists but app doesn't recognize it
- Docker browser pages stuck on loading spinners (Convex WebSocket unreachable)
- Docker MCP connections fail silently (server binding issue)
- Dev login button does nothing (no error, no redirect)
- `npx convex dev` stuck on "Preparing Convex functions..." (schema validation, import errors, tsc errors)

## When to Add Here

Add a new insight directory when:

- A bug took 30+ minutes to diagnose
- The fix was non-obvious or underdocumented
- Future agents/developers will hit the same wall
- The official docs are wrong, incomplete, or misleading for our stack

### How to Add

```
insights/
  your-topic-name/
    README.md          # Main writeup (symptom, root cause, fix, checklist)
    examples.md        # Optional: code examples, before/after
    screenshots/       # Optional: error screenshots, diagrams
```

1. Create a directory under `insights/` with a descriptive kebab-case name
2. Write a `README.md` inside with: Symptom, Root Cause, Fix, Debugging Checklist
3. Add the directory to the Index table above
4. Update `AGENTS.md` quick lookup table if the topic is broadly relevant
