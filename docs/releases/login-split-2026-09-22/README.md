# Portal login split — 2026-09-22

A public summary of the release that separated the five portal sign-in flows and hardened
demo-account seeding. Deployment-specific details (hosts, registry paths, image digests,
deployment names) are intentionally omitted.

## What changed

- `/` redirects to the customer `/homepage` instead of a mixed persona selector. Each persona
  has its own entry route: `/admin/login`, `/ops/login`, `/guard/login`, `/tenant/login` and
  `/owner/login`.
- Hosted WorkOS AuthKit sign-in carries the selected portal through the OAuth state. After the
  callback, `users.resolvePostAuthDestination` (new optional `intended_persona` argument, so older
  callers keep working) sends the user to the matching portal, or back to that portal's login page
  with a `role_mismatch` or `access_not_configured` message.
- Demo seeding moved behind internal Convex actions. The mega-seed (`seedDemo:mega`) and WorkOS
  provisioning refuse to run unless `DEMO_SEEDING_ENABLED=true`, never overwrite an existing
  account's password, and create a missing account only when its persona-specific
  `DEMO_*_PASSWORD` variable is set. The former public `seedDemo:seedMega` wrapper was removed.
- `/dev/login` resolves preset credentials server-side, so no password reaches a client bundle.

## Sign-out follow-up

The first rollout passed every persona sign-in, but sign-out showed the client error boundary
until refresh. See [signout.md](signout.md) for the diagnosis: the sign-out Server Action
redirected to `/`, which now itself redirects, and the client lost the Server Action redirect
metadata. The fix redirects straight to `/homepage` and adds
`scripts/check-signout-redirect.mjs`, a loopback-only regression probe.

## How it was verified

- Typecheck, lint, the full Vitest suite and a production build passed on the login change; the
  sign-out follow-up passed lint, typecheck and the focused auth regressions. Those regressions (callback portal state, role routing, OPS access to the
  permission-filtered admin portal, tenant rejection from the admin portal, password
  preservation and both seeding gates) are in `lib/authPortal.test.ts`,
  `src/app/callback/__tests__/route.test.ts`, `convex/users.postAuth.test.ts` and
  `convex/actions/workos.test.ts`. Dated local results are in
  [../../public-demo-access/04-results.md](../../public-demo-access/04-results.md).
- The backend was deployed before the web tier, after a Convex dry run. Its callable inventory
  differed from the previous one only by the removal of the public `seedMega` wrapper; no schema
  or index migration was needed.
- On the deployed instance: the homepage, listings, all five login routes and `/healthz`
  returned 200; existing tenant, owner, admin, OPS and guard fixtures each reached their own
  dashboard; a tenant session requesting the admin dashboard was sent back with a role-mismatch
  message; `/dev/login` returned 404; and sign-out reached the signed-out homepage without an
  error once the follow-up was deployed.
- No accounts were created, no passwords were changed, and no seed or data-changing workflow was
  run during verification.

## Rollback

The web tier and backend deploy independently. The new backend stays compatible with the
previous web image, so the preferred rollback is to redeploy the previous web image and keep the
backend. Rolling the backend back would reintroduce the public seeder and the old
password-overwriting provisioning behaviour, so do that only deliberately.
