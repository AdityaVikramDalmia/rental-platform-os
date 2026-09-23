# Verification checklist

Run these checks on the deployed demo revision before publishing any demo credentials.

## Entry and role routing

1. Confirm `/` opens the customer homepage rather than a mixed persona selector.
2. Confirm each of the five login URLs renders its own entry screen.
3. Complete hosted sign-in for tenant, owner, OPS, and limited admin accounts and confirm each lands in
   the selected portal.
4. Complete guard phone/password sign-in and confirm it lands in the guard portal.
5. Use a tenant account on the admin entry route and confirm it returns a role-mismatch message.
6. Confirm an OPS account can still open permission-filtered `/admin/*` pages it is authorized to use.
7. Confirm the unassigned OPS fixture returns an `access_not_configured` message instead of a 500.

## Permission boundary

1. Inspect the limited admin's role assignments in Convex.
2. Confirm the account cannot create or edit users, assign roles, reset passwords, change system
   configuration, trigger payouts, or run demo seeds.
3. Confirm hidden navigation and direct backend calls both enforce those restrictions.
4. Confirm tenant, owner, guard, and OPS actions affect only their intended fixture records.

## Seed boundary

1. With `DEMO_SEEDING_ENABLED` absent or false, confirm the internal mega-seed and WorkOS provisioning
   action reject execution.
2. Confirm no public `seedDemo:seedMega` function is present in the deployed Convex API.
3. Run the seed against a disposable test deployment with existing users and confirm their passwords
   remain valid and unchanged.
4. Remove or set `DEMO_SEEDING_ENABLED=false` after the seed completes.

## Repository checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Record the deployed application commit, GitOps commit, image digest, WorkOS environment, Convex
deployment, and the date of the credential rotation in a private maintainer log. Do not put passwords
or reset links in that log.
