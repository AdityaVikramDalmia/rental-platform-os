# Verification Log

Functional testing history for the Rental Platform OS platform. Tracks what's been tested, results, and known issues per feature area.

## Coverage Map

| Feature Area               | Status     | File                                                           | Last Tested |
| -------------------------- | ---------- | -------------------------------------------------------------- | ----------- |
| Admin Dashboard            | TESTED     | [admin-dashboard.md](admin-dashboard.md)                       | 2026-02-17  |
| Admin — Societies          | TESTED     | [admin-societies.md](admin-societies.md)                       | 2026-02-17  |
| Admin — Guards             | TESTED     | [admin-guards.md](admin-guards.md)                             | 2026-02-17  |
| Admin — Roles              | TESTED     | [admin-roles.md](admin-roles.md)                               | 2026-02-17  |
| Admin — Admin Management   | TESTED     | [admin-management.md](admin-management.md)                     | 2026-02-17  |
| Admin — Settings           | TESTED     | [admin-settings.md](admin-settings.md)                         | 2026-02-17  |
| Guard Login                | TESTED     | [guard-login.md](guard-login.md)                               | 2026-02-17  |
| Guard Portal               | TESTED     | [guard-portal.md](guard-portal.md)                             | 2026-02-17  |
| PWA Setup (Tier 1)         | TESTED     | — (ad-hoc verification session)                                | 2026-02-17  |
| P44 OPS Superset Expansion | TESTED     | [p44-ops-superset-expansion.md](p44-ops-superset-expansion.md) | 2026-02-20  |
| Guard Change Password      | NOT TESTED | —                                                              | —           |

## Status Legend

| Status           | Meaning                                             |
| ---------------- | --------------------------------------------------- |
| **TESTED**       | All planned workflows run, results recorded         |
| **PARTIAL**      | Some workflows tested, others pending               |
| **NOT TESTED**   | No testing done yet                                 |
| **NEEDS RETEST** | Code changed since last test — results may be stale |

## For Contributors

**Before testing a feature:**

1. Check this index — it may already be tested
2. If status is TESTED and no code changes since `Last Tested`, skip it
3. If status is NEEDS RETEST, re-run the failing/changed workflows only

**After testing:**

1. Create/update the feature's verification file
2. Update this index with status and date
3. Log any new bugs in `bugs/` directory

### Verification File Template

```markdown
# Feature Area — Verification Log

| Field           | Value                                      |
| --------------- | ------------------------------------------ |
| **Status**      | TESTED / PARTIAL / NEEDS RETEST            |
| **Last Tested** | YYYY-MM-DD                                 |
| **Test Method** | Playwright + browser_snapshot + Convex CLI |
| **Tested By**   | Person or tool that ran the checks         |

## Workflows Tested

| ID  | Workflow    | Result    | Notes   |
| --- | ----------- | --------- | ------- |
| W1  | Description | PASS/FAIL | Details |

## DB Verifications

| Check       | Table      | Result    | Evidence       |
| ----------- | ---------- | --------- | -------------- |
| Description | table_name | PASS/FAIL | What was found |

## Known Issues

- [BUG-NNN](../bugs/BUG-NNN-slug.md) — Brief description

## Test Data Created

| Entity     | Identifier        | State    | Notes                                     |
| ---------- | ----------------- | -------- | ----------------------------------------- |
| e.g. Guard | phone: 8888888888 | INACTIVE | Created during W10, status changed in W23 |
```
