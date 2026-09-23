# Security Policy

## Reporting a vulnerability

Please do not report vulnerabilities in public issues, discussions or pull requests. Instead, open
a **private GitHub security advisory** on this repository: go to the **Security** tab and choose
**Report a vulnerability**. Include reproduction steps, the impact, and a proposed mitigation if you
have one.

Do not include credentials, private keys, session cookies, personal data or WorkOS tokens in a
report.

This project is a prototype and reference implementation. Reports are handled on a best-effort
basis, and there is no supported production release.

## Development fixture accounts are public

The fixture accounts and their passwords in `src/app/dev/login/accounts.ts`, `src/lib/local-auth.ts`
and `scripts/admin-dev-login-smoke.mjs` are **for local development only**. They are public by
design: anyone who reads this repository knows them. Never use them on a deployment that other
people can reach.

The development login is gated in code:

- The `/dev/login` page returns 404 unless `NODE_ENV` is `development`
  (`src/app/dev/login/page.tsx` calls `isDevLoginEnabled()` from `lib/localAuthConfig.ts`).
  `next build`/`next start` and the provided `Dockerfile` run with `NODE_ENV=production`, so the page
  is disabled in production. `src/lib/local-auth.test.ts` covers this.
- The page's Server Actions in `src/app/dev/login/actions.ts` refuse to run outside development
  unless `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true` is set. **Never set that variable on a deployment.**
  It would re-enable the development sign-in actions outside development.
- Zero-signup local auth (`LOCAL_AUTH`) only mints tokens when both `NODE_ENV=development` and
  `LOCAL_AUTH=true` are set (`isLocalAuthEnabled()` in `lib/localAuthConfig.ts`). Its signing key
  lives in the git-ignored `.local-auth/` directory.

## Seeding shared deployments

- **Never run the demo seeders against a shared or internet-reachable deployment** unless it is an
  isolated demo deployment created for that purpose. These are `npm run seed:dev`
  (`ensureDevWorkosUsers` in `convex/actions/workos.ts`) and the mega demo seed (`mega` in
  `convex/seedDemo.ts`), which calls `ensureDevWorkosUsers`. Both refuse to run unless the Convex
  environment has `DEMO_SEEDING_ENABLED=true`. Unset the flag once seeding is done.
- In the current code, `ensureDevWorkosUsers` creates a missing fixture account with the password in
  the matching `DEMO_*_PASSWORD` variable, and never changes an existing account's password.
- **Earlier revisions in this repository's history behaved differently.** The initial version of
  `ensureDevWorkosUsers` had no gate, created fixture accounts with the hard-coded development
  passwords, and reset existing fixture accounts to those passwords. Treat any deployment that was
  ever seeded with such a revision as if its fixture accounts use the public defaults.
- If you operate a hosted demo, set your own unique password for every fixture account after
  seeding, never reuse the development defaults, and never publish credentials for an account with
  Super Admin permissions.

## Secrets

Real values belong in git-ignored `.env*.local` files and the Convex environment
(`npx convex env set`). `.env.example` contains placeholders only. `npm run release:check` fails if
a tracked file contains a private key or a WorkOS-style secret. It also fails if a built client
bundle contains a development fixture password.
