# P44 OPS Superset Rollout Runbook

Operational runbook for launch, monitoring, and rollback of OPS field-worker access (`P44-E09`).

## Scope

- Rollout keys:
  - `ops_field_worker_enabled`
  - `ops_field_worker_canary_user_ids`
- Runtime mode resolver: `resolveP44RolloutState` (`DISABLED | CANARY | ENABLED`)
- Admin controls surface: `/admin/settings` → OPS Field-Worker Rollout card
- Monitoring surface: `/admin/analytics` → P44 OPS Superset Release Gate card

## Owners

- **Incident commander**: Admin on-call
- **Feature operator**: Ops platform owner
- **Verification owner**: QA/verification owner
- **Communications owner**: Product operations lead

## Pre-Check (Before Any Rollout Change)

1. Confirm latest commit includes E09 rollout controls and gate card.
2. Confirm `npx tsc --noEmit` and `npm run build` are green.
3. Confirm canary candidate OPS users are ACTIVE and have `guard_profiles`.
4. Confirm no known `P44` blockers in `bugs/` with open severity S0/S1.
5. Confirm monitoring card loads and returns fresh `generated_at` timestamp.

## Canary Execute Steps

1. Keep global flag OFF:
   - `ops_field_worker_enabled = false`
2. Add 2-3 ACTIVE OPS users into canary list:
   - `ops_field_worker_canary_user_ids = [userId1, userId2, ...]`
3. Run smoke checks with those users:
   - Submit lead
   - Accept bounty
   - Complete visit
4. Monitor release-gate card for:
   - OPS profile coverage
   - OPS endpoint error rate
   - Incentive sanity
5. Keep canary for 48h before expansion.

## Full Enable Steps

1. Set global ON:
   - `ops_field_worker_enabled = true`
2. Clear canary list:
   - `ops_field_worker_canary_user_ids = []`
3. Re-run smoke checks with at least one non-canary OPS account.
4. Validate leaderboard segmentation:
   - GUARD excludes OPS
   - OPS excludes GUARD

## Rollback (Config-Only)

1. Set `ops_field_worker_enabled = false`.
2. Set `ops_field_worker_canary_user_ids = []`.
3. Verify OPS field-worker requests now fail with `Feature not enabled`.
4. Verify guard flows remain healthy:
   - `/guard/submit-lead`
   - `/guard/visits`
   - `/guard/bounties`
5. Confirm historical OPS-created data remains present (no deletion/rewrite).

## Validation Checkpoints

- **Coverage checkpoint**: profile coverage >= 95%
- **Error checkpoint**: OPS endpoint error rate < 1%
- **Incentive checkpoint**: no zero-case/mismatch alert in gate card
- **Isolation checkpoint**: persona filters remain isolated

## Success Criteria

- Rollout mode can be changed at runtime without deployment.
- Canary user management rejects invalid/non-OPS/inactive ids.
- Monitoring card reflects current rollout health and thresholds.
- Rollback fully disables OPS field-worker access via config only.
- Guard and historical OPS records remain stable after rollback.

## Incident Communication Template

Use this template in internal ops channel during rollback:

```
P44 OPS Superset Rollback Initiated

Time: <IST timestamp>
Commander: <name>
Reason: <error-rate spike / smoke failure / data anomaly>

Actions:
1) ops_field_worker_enabled=false
2) ops_field_worker_canary_user_ids=[]

Validation:
- OPS field-worker blocked: <pass/fail>
- Guard flows healthy: <pass/fail>
- Historical OPS data intact: <pass/fail>

Next update ETA: <time>
```
