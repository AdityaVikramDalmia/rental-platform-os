# Verified deployed behavior

Verified on **2026-09-22** at `https://rentalos.dev.bytenexuscloud.com`.

## Build and backend

- The initial `8a80742` linux/amd64 image built successfully and passed nine local
  runtime route checks with the existing runtime configuration.
- Convex dry run and deployment succeeded on the existing production target;
  no indexes were deleted and no schema migration was needed.
- Before/after callable inventories differ only by removal of public
  `seedDemo.js:seedMega`. The portal query now accepts optional `intended_persona`;
  mega-seeding and provisioning are internal. See [backend.json](backend.json).
- The sign-out correction `3b42a27` passed changed-file lint, typecheck and all
  fourteen focused auth regressions. Its clean Git-archive container build passed.
- The production-response regression fails against the initial image and passes
  against the corrected image. See [the response receipt](signout-response.json).

The earlier full suite (334 passing tests, one skipped) is recorded in
`docs/public-demo-access/04-results.md` for the login change. It is not relabelled
as a new full-suite run after the narrow sign-out correction.

## Live checks

- The exact final image rolled out successfully: one ready/available replica and
  zero restarts on the new pod. [Runtime receipt](runtime.json).
- `/`, `/homepage`, `/listings`, all five login routes and `/healthz` return 200;
  `/` finishes at `/homepage`. [HTTP receipt](http.json).
- Existing Tenant, Owner and Admin fixtures completed hosted WorkOS email/password
  authentication and rendered their correct dashboards.
- Existing OPS and Guard fixtures completed phone/password authentication and
  rendered their correct dashboards.
- A Tenant session requesting the Admin dashboard was redirected to the Admin
  login with an explicit role-mismatch alert.
- The production development-login route returns 404.
- On the final corrected image, a live Guard sign-out immediately reached the
  signed-out homepage, without an error boundary; the app session cookies were absent.
  [Browser receipt](browser.json).

The backend and five login implementations are unchanged by the sign-out-only
follow-up. The final HTTP matrix and live sign-out check target that final image.

## Scope and limits

ArgoCD is Healthy. Its remaining OutOfSync resource is the existing ExternalSecret;
ESO reports Ready/SecretSynced. Every other resource is synced. This is recorded
explicitly rather than claiming the aggregate sync status is green.

Tests used existing fixture accounts and read dashboard data. No passwords or
cookie values were captured in artifacts, no accounts were created, and no seed
or data-changing product workflow was run. Recovery, new-user webhook onboarding,
Google/Microsoft/GitHub/Apple sign-in and the separate public-demo mode were not
exercised. Existing hosted SSO can retain a fixture identity across local app
sign-out; QA isolates only the two relevant origins' cookies between identities.

Public credential publication remains a separate gated release. The later isolated
demo branch is not included here. The portfolio/Cloudflare deployment and DNS were
left untouched by this Rental OS rollout.
