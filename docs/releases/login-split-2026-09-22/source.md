# Reconciled source history

The previously deployed image named `8b439bb`; its later documentation commit was
`ee62418d460423fb33736a9cf5caef3a32dd586c`. The current repository starts at squashed
commit `4c7b685`, followed by login changes `cad517f` and test evidence `8a80742`.

A retained pre-squash Git bundle was inspected through a disposable bare clone.
It establishes `8b439bb` to `ee62418` ancestry; only `.gitignore` and deployment
documentation changed between them. Comparing `ee62418` with `4c7b685` finds
deployment-document removal, ignore rules, release-check hardening, and the
development-login refactor that moves preset credentials out of client bundles.

The Convex trees, schema/indexes, crons/components, Dockerfile, dependency manifest,
lockfile and Next configuration match across the old deployed source and the
squashed baseline. This is a tree comparison, not invented Git ancestry.

The login release changes three backend runtime files: `convex/users.ts`,
`convex/actions/workos.ts`, and `convex/seedDemo.ts`. The new optional
`intended_persona` argument remains compatible with old no-argument callers.
Deploy that backend before the new web image.

Later isolated-demo work at `a56848d` / `4a1de93` is not included in this release.
It needs separate integration, environment setup and verification before public
credentials are advertised.
