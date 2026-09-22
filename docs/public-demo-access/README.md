# Public demo access

This directory records the security boundary and maintainer steps for turning the hosted Rental OS
development deployment into a public portfolio demo.

- [01-isolation.md](01-isolation.md) — current account and data-isolation assessment
- [02-provisioning.md](02-provisioning.md) — guarded account provisioning and password rotation
- [03-verification.md](03-verification.md) — checks required before publishing credentials
- [04-results.md](04-results.md) — dated local verification evidence for commit `cad517f`

## Current decision

Public credentials are **not ready to publish**. The known tenant, owner, OPS, and guard identities
are seeded fixtures, but they share one mutable development deployment. The known admin identities
have Super Admin access and must never be published. A dedicated, permission-limited demo admin is
still required.

The application changes in this branch prepare five explicit entry routes and close the unsafe seed
paths, but they have not been deployed and no hosted credentials have been changed.
