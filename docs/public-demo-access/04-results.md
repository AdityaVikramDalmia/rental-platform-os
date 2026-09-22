# Verification results — 2026-09-22

These results cover the source tree committed as `cad517f` (`Separate portal login workflows`). The
checks ran against the same working tree before that commit was created; the commit contained all
tested code without further code changes.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | Exit 0. |
| Focused auth and seed regressions | `npx vitest run lib/authPortal.test.ts src/app/callback/__tests__/route.test.ts convex/users.postAuth.test.ts convex/actions/workos.test.ts` | Exit 0. Four files and 14 tests passed. |
| Full test suite | `npm test` | Exit 0. 25 files passed, one file was skipped; 334 tests passed and one test was skipped. |
| Changed-file lint | `npx eslint` followed by the 30 changed TypeScript and TSX paths | Exit 0 with no output. |
| Repository lint | `npm run lint` | Exit 0 with 81 pre-existing warnings and no errors. |
| Production build | `WORKOS_CLIENT_ID=client_build_placeholder WORKOS_API_KEY=sk_test_build_placeholder WORKOS_COOKIE_PASSWORD=build-placeholder-cookie-password-at-least-32-chars NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback npm run build` | Exit 0. Next.js compiled, typechecked, generated all static pages, and listed all five login routes. Placeholder build values were process-local and were not written to a file. |
| Patch hygiene | `git diff --check` | Exit 0. |

The focused regression set covered callback portal-state validation, exact role routing, OPS access to
the permission-filtered admin portal, rejection of a tenant from the admin portal, preservation of
existing WorkOS passwords, explicit persona passwords for new accounts, and both demo-seeding gates.

## Local browser checks

Browser QA used Ego Browser TaskSpace 11, page `p2`, with:

```bash
LOCAL_AUTH=true npm run dev:frontend
```

The following behavior was observed at `http://127.0.0.1:3000`:

- `/` returned a redirect and finished at `/homepage`.
- `/admin/login`, `/ops/login`, `/guard/login`, `/tenant/login`, and `/owner/login` each rendered a
  distinct entry page.
- Admin, OPS, tenant, and owner hosted-auth links included the selected portal in WorkOS state.
- `/admin/login?error=role_mismatch`, `/guard/login?error=role_mismatch`,
  `/tenant/login?error=role_mismatch`, and `/owner/login?error=role_mismatch` displayed a clear access
  message.
- `/ops/login?error=access_not_configured` displayed the missing-role message instead of entering the
  dashboard.
- `/owner-services` included a direct `Owner portal sign in` link to `/owner/login`.
- The public header's `Sign In` link pointed to `/tenant/login`.

The local browser run did not complete a hosted WorkOS sign-in. The lightweight frontend-only local
server exposed the generated authorize URL, but its local AuthKit authorization endpoint required the
full local auth backend. Callback intent and post-auth role resolution were therefore verified by the
focused tests rather than claimed as an end-to-end browser login.

After QA, the agent-created browser page `p2` was closed, leaving the shared portfolio page untouched.
The frontend development server was stopped with `Ctrl-C`. The shared TaskSpace was later closed by
the parent session.

## Repository and external-state status

Immediately after `cad517f`, `git status --short --branch` reported a clean `main` branch ahead of
`origin/main` by one commit. The commit remained local and unpushed during this work. No deployment,
DNS change, Convex environment change, WorkOS account creation or password rotation, credential
publication, or repository-visibility change was performed. Remote repository visibility was not
modified or independently reverified.

Public demo credentials remain blocked on the isolation and provisioning work in
[01-isolation.md](01-isolation.md) and [02-provisioning.md](02-provisioning.md).
