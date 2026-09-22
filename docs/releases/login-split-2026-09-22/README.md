# BNC login split rollout — 2026-09-22

The owner explicitly authorized deploying the prepared login split to the existing
BNC Rental OS deployment. This supersedes the earlier local-only hold for this
code rollout. Public credential publication and the isolated-demo branch remain
separate work.

- [Source provenance](source.md)
- [Deployment and rollback](rollout.md)
- [Verification](verification.md)
- [Verified backend contract](backend.json)
- [Sign-out regression and correction](signout.md)
- [Live runtime](runtime.json), [HTTP checks](http.json), and [browser checks](browser.json)

Final web image source: `3b42a2726e8b1e748d2fdc432693d6879d7fdc9c`.
Backend source: `8a8074277c4e30e20a4c6eb5e4e576205f3fe5b4` (login changes `cad517f`).
GitOps image change: `055ab58`, following the initial rollout at `c4e7361`.
Final image: `3b42a27@sha256:833707cbbf5572cf1f56bfe1e799f899a7459a206913602e5d1cbbcb79bd047d`.

The deployment keeps existing resources, DNS, ingress and runtime secrets. No
schema/index migration, seeding, account creation or password rotation is part
of this update. Public demo credentials must still follow the isolation review.
