# Isolation assessment

## What is isolated

The source marks `convex/seedDemo.ts` data as fictitious and intended for demonstration. Tenant,
owner, OPS, and guard fixtures use synthetic test-domain or local-domain identities, and the hosted
application runs under a development hostname.

The guarded seed flow now has these properties:

- the full seed is an internal Convex action rather than a public action;
- `DEMO_SEEDING_ENABLED=true` is required before the seed or WorkOS provisioning can run;
- existing WorkOS passwords are never updated by a seed;
- a missing account can only be created when its persona-specific password environment variable is
  present; there is no password fallback.

## Source revision warning

The canonical checkout at `~/Documents/work/flatify/rental-platform-os` and its configured GitHub
`origin/main` both resolved to `4c7b685` during this work. Separate deployment evidence identified an
application revision `ee62418` and an image built from `8b439bb`. Reconcile those histories and choose
the authoritative source before building or deploying these changes. Do not reset this checkout to a
revision that is absent from its configured remote.

## What is shared

The hosted environment is one shared Convex deployment and one WorkOS environment. Demo users see
and modify the same fixture dataset. There is no per-visitor tenant, database copy, session reset, or
automatic rollback. This is a shared staging demo, not a disposable sandbox per visitor.

The current seed catalog contains more identities than the five portfolio personas. Some are used by
linked fixture records. Running the mega-seed can add or update shared demo data, so it must remain a
maintainer-only operation.

## Account assessment

| Persona | Candidate fixture              | Assessment                                                                                                                                                       |
| ------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant  | `tenant1@test.demorentals.com` | Seeded fixture with the richest tenant journey; suitable only after a deliberate public-password rotation.                                                       |
| Owner   | `owner1@test.demorentals.com`  | Seeded fixture linked to owner data; suitable only after a deliberate public-password rotation.                                                                  |
| OPS     | phone ending `7777`            | Seeded OPS fixture with a role assignment; suitable only after role verification and deliberate rotation.                                                        |
| Guard   | phone ending `9999`            | Seeded guard fixture; suitable only after deliberate rotation.                                                                                                   |
| Admin   | none yet                       | The known hosted admin and source fixture admin are Super Admin accounts. Create a separate permission-limited demo admin; do not publish either existing admin. |

The OPS fixture with phone ending `8888` has no role assignment in the observed hosted data. The new
layout returns it to `/ops/login?error=access_not_configured` instead of allowing dashboard queries to
fail, but it is not a demo candidate.

## Required boundary before publication

Use a dedicated WorkOS account for each persona. Assign the admin candidate a new read-only or tightly
scoped `Demo Viewer` role. Do not grant account creation, role management, password reset, payout,
configuration, or destructive mutation permissions. Confirm that any mutation the other personas can
perform affects only fictitious shared demo records and can be restored by a maintainer reset.
