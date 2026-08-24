---
id: P44-E08
title: Admin UX Alignment
phase: 44
status: done
depends_on: ["P44-E06", "P44-E07"]
skills: ["rental-platform-os-rules", "rental-platform-os-arch", "frontend-ui-ux"]
updated_at: 2026-02-20
---

# P44-E08: Admin UX Alignment

## Overview

Align admin list/detail/analytics experiences with mixed GUARD+OPS field-worker populations while preserving existing guard-first defaults and referral scope boundaries.

## Task Queue

- [x] P44-E08-T01: Add persona filters to admin field-worker list/search/detail flows
- [x] P44-E08-T02: Align leaderboard and analytics views with persona segmentation
- [x] P44-E08-T03: Enforce and communicate referral scope boundaries in admin UX

---

## T01: Add Persona Filters to Admin Field-Worker List/Search/Detail Flows

### Objective

Update admin guard pages to support persona filtering (`GUARD`, `OPS`, `ALL`) without changing the default guard-centric operational view.

### Required Reading

- `src/app/(admin)/admin/guards/page.tsx`
- `src/app/(admin)/admin/guards/[id]/page.tsx`
- `convex/guards.ts` (`list`, `getById`, `search`)
- `notes/features/35-ops-superset-expansion.md` (Sections 7.3 and 12)

### Key Rules

1. Default admin filter remains `GUARD` for backward compatibility.
2. Persona filter must be explicit and persisted in URL/query state where existing filters already do so.
3. Detail pages must render OPS rows with field-worker semantics, not guard-only assumptions.
4. Avoid breaking existing links and route parameters.

### Deliverables

- [ ] `convex/guards.ts` - list/getById/search filter args and logic for persona segmentation
- [ ] `src/app/(admin)/admin/guards/page.tsx` - persona filter UI and query wiring
- [ ] `src/app/(admin)/admin/guards/[id]/page.tsx` - OPS-capable detail rendering updates

### Acceptance Criteria

1. Admin list defaults to guard-only rows on first load.
2. Admin can switch to OPS-only and ALL views using explicit filter control.
3. Search results respect selected persona filter.
4. OPS detail pages load correctly when selected from filtered list.
5. Existing guard detail behavior remains unchanged.
6. Type-check/build and diagnostics pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on updated admin pages and `convex/guards.ts`.

### Out of Scope

- Incentive engine internals
- Guard portal layout changes
- Rollout gate operations

---

## T02: Align Leaderboard and Analytics Views With Persona Segmentation

### Objective

Ensure admin leaderboards and analytics can segment or combine GUARD/OPS cohorts explicitly, avoiding silent mixing.

### Required Reading

- `src/app/(admin)/admin/analytics/page.tsx`
- `src/components/admin/dashboard/*`
- `convex/incentives.ts` (`getLeaderboard`)
- `convex/analytics.ts`
- `notes/features/35-ops-superset-expansion.md` (Sections 9 and 11)

### Key Rules

1. `GUARD` remains default filter for existing guard KPI cards.
2. Provide OPS and ALL views via explicit filter controls.
3. `ALL` view must disclose mixed persona composition.
4. Ensure metric labels distinguish `guard_count`, `ops_count`, and `field_worker_count` where applicable.

### Deliverables

- [ ] `convex/analytics.ts` - segmented count fields and query contracts
- [ ] `src/app/(admin)/admin/analytics/page.tsx` - persona filter controls and segmented rendering
- [ ] `src/components/admin/dashboard/DashboardKPICards.tsx` - segmented KPI support

### Acceptance Criteria

1. Guard-only leaderboard excludes OPS rows.
2. OPS-only leaderboard excludes guard rows.
3. ALL leaderboard includes both and labels persona context clearly.
4. Analytics cards can render segmented counts without breaking existing charts.
5. Existing admin workflows relying on guard defaults remain intact.
6. Build and diagnostics pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed analytics and dashboard files.

### Out of Scope

- New analytics dimensions unrelated to P44
- Notification monitoring changes
- OPS portal UI updates

---

## T03: Enforce and Communicate Referral Scope Boundaries in Admin UX

### Objective

Keep guard referral GUARD-only and ensure admin tools communicate OPS exclusion clearly to avoid accidental attribution assumptions.

### Required Reading

- `convex/referrals.ts`
- `src/app/(admin)/admin/referrals/page.tsx`
- `notes/features/17-referral-system.md`
- `notes/features/35-ops-superset-expansion.md` (Section 11.3)

### Key Rules

1. Do not expand guard referral program to OPS in P44.
2. Make exclusion explicit in admin UI copy/validation errors.
3. Keep DemoRentals tenant/owner referral behavior unchanged.
4. Ensure ops-created field-worker records are not accidentally interpreted as guard-referral-eligible.

### Deliverables

- [ ] `convex/referrals.ts` - explicit guard-only assertion paths and messages
- [ ] `src/app/(admin)/admin/referrals/page.tsx` - copy/legend updates clarifying GUARD-only scope
- [ ] `convex/referrals.test.ts` - OPS exclusion tests for guard referral paths

### Acceptance Criteria

1. Guard referral creation/reward logic rejects OPS users deterministically.
2. Admin referral UI clearly labels guard referral scope as GUARD-only.
3. Existing guard referral behavior remains unchanged.
4. Tenant/owner referral flows are unaffected.
5. Tests cover OPS-attempted referral edge cases.
6. Type-check/build and diagnostics pass.

### Verification

```bash
npx tsc --noEmit
npm run build
```

Run `lsp_diagnostics` on changed referral backend/frontend files.

### Out of Scope

- Referral program redesign
- New referral products for OPS
- Field-worker endpoint rollout gates
