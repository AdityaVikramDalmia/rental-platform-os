# Rollout and rollback

## Preparation

The existing app was healthy on the prior digest. The Harbor `apps` project was
verified private. Work proceeded in isolated app/GitOps worktrees, preserving
concurrent portfolio and demo-isolation work.

Build the exact committed tree for `linux/amd64`, setting all three public build
arguments to the existing deployment values: `NEXT_PUBLIC_CONVEX_URL`,
`NEXT_PUBLIC_CONVEX_SITE_URL`, and `NEXT_PUBLIC_WORKOS_REDIRECT_URI`. The Dockerfile
completed without build-time WorkOS secrets. Runtime smoke checks used the existing
Rental OS secret, passed through a temporary mode-0600 environment file; no values
were printed or added to Git.

## Backend first

Select the production deployment explicitly with `CONVEX_DEPLOYMENT` in the
command's environment, then run `npx convex deploy --dry-run --typecheck enable
--codegen disable`. Follow the successful dry run with `--yes` instead of `--dry-run`.
No seed or migration command is run.

The installed CLI's `--env-file` mode requires both selection and authentication
information in that file; a selection-only file caused a misleading missing-token
response despite a valid stored login. Using explicit process-level deployment
selection preserved the stored authentication. No credential rotation was needed.

Read `convex function-spec --prod` afterward. Confirm the optional portal argument,
internal-only provisioning/mega-seed actions and absence of public `seedMega`.

## Web tier

Push the verified image to the existing private Harbor project, then update only
the Rental OS Deployment image in BNC GitOps to the returned registry digest.
Server-side dry-run validation passed. Commit/push the manifest plus app operations
notes and changelog. Refresh the existing Rental OS ArgoCD Application; wait for
the exact desired image before checking rollout completion.

The existing single-replica, zero-surge strategy can briefly interrupt service
while replacing the pod. Resources and ingress are unchanged. `/healthz` alone is
insufficient: check the homepage/listings and actual login flows afterward.

## Rollback

The previous image is
`8b439bb@sha256:8bd6482639c0e49b3ac265d415cbdd8cb1a2d463dbe83dc1e7fa0989a6b00315`.
Commit that image reference back into the Rental OS Deployment and reconcile with
ArgoCD. The new backend remains compatible with the older frontend. A backend
rollback would reopen the former public seeder and password-reset behavior, so
prefer a web-only rollback while investigating.

This deployment does not integrate the separate demo-isolation branch, enable
demo seeding, provision accounts, or publish credentials.
