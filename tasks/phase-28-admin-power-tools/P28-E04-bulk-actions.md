---
id: P28-E04
title: Bulk Actions Framework
phase: 28
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P28-E04: Bulk Actions Framework

## Overview

Add row selection checkboxes and a bulk action bar to the lead table, payout table, and verification table. The `BulkActionBar` is a reusable component fixed to the bottom of the viewport that animates in when rows are selected and out when the selection is cleared. Bulk mutations call existing Convex mutations in parallel with `Promise.all`. Destructive actions require `AlertDialog` confirmation.

## Task Queue

- [x] P28-E04-T01: Create reusable BulkActionBar component
- [x] P28-E04-T02: Add row selection and bulk actions to lead table
- [x] P28-E04-T03: Add row selection and bulk actions to payout table
- [x] P28-E04-T04: Enhance verification table with BulkActionBar pattern

---

## T01: Create Reusable BulkActionBar Component

### Objective

Create `src/components/admin/BulkActionBar.tsx` — a fixed-bottom bar that appears when items are selected, shows the selection count, renders action buttons passed as props, and has a "Clear" button. Animates in/out with a slide-up transition.

### Required Reading

- `src/components/ui/button.tsx` — Existing shadcn/ui Button component (use it for action buttons)
- `src/components/ui/alert-dialog.tsx` — Existing shadcn/ui AlertDialog (used by callers for destructive confirmation — the BulkActionBar itself does NOT handle confirmation dialogs)
- `notes/06-admin-panel-ux.md` — "Global Layout" section (z-index conventions, fixed positioning context)

### Key Rules

1. The component is a client component (`"use client"`).
2. Props interface:

   ```typescript
   type BulkAction = {
     label: string;
     icon?: React.ReactNode;
     onClick: () => void;
     variant?: "default" | "destructive" | "outline";
     disabled?: boolean;
   };

   type BulkActionBarProps = {
     selectedCount: number;
     actions: BulkAction[];
     onClear: () => void;
   };
   ```

3. The bar is only rendered (and visible) when `selectedCount > 0`. When `selectedCount === 0`, the bar is hidden. Use CSS animation for the slide-up: `translate-y-full` when hidden, `translate-y-0` when visible, with `transition-transform duration-200`. Use `AnimatePresence` from `framer-motion` if it's already a project dependency — otherwise use a CSS-only approach with `data-visible` attribute.
4. Positioning: `fixed bottom-0 left-0 right-0 z-50`. The bar sits above all other content. On desktop, respect the sidebar width by using `left-[var(--sidebar-width,240px)]` or by checking how the admin layout handles fixed elements. If the sidebar width is not a CSS variable, use `left-0` and accept that the bar overlaps the sidebar — it's still functional.
5. Bar content (left to right): selection count text (`"{N} selected"`), action buttons, "Clear selection" button (ghost variant, right-aligned).
6. Bar styling: `bg-background border-t border-border shadow-lg px-6 py-3 flex items-center gap-3`.
7. Action buttons use shadcn/ui `Button` with the `variant` from the `BulkAction` prop. Default variant is `"default"`.
8. The "Clear selection" button calls `onClear`. It uses `Button` with `variant="ghost"` and `size="sm"`. Place it at the far right using `ml-auto`.
9. The `BulkActionBar` does NOT handle confirmation dialogs. Callers wrap destructive `onClick` handlers with their own `AlertDialog` logic.
10. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/components/admin/BulkActionBar.tsx` — Reusable fixed-bottom bulk action bar with slide-up animation, selection count, action buttons, and clear button

### Acceptance Criteria

1. Bar is not visible when `selectedCount === 0`
2. Bar slides up into view when `selectedCount > 0`
3. Bar shows correct count: "1 selected", "3 selected", etc.
4. Action buttons render with correct labels, icons, and variants
5. "Clear selection" button calls `onClear`
6. Bar is fixed to the bottom of the viewport with `z-50`
7. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/BulkActionBar.tsx`.

### Out of Scope

- Confirmation dialogs (handled by callers)
- Keyboard shortcut to clear selection (V2)
- Undo after bulk action (V2)
- Progress indicator for long-running bulk operations (V2)

---

## T02: Add Row Selection and Bulk Actions to Lead Table

### Objective

Add a checkbox column to the lead table in `src/app/(admin)/admin/leads/page.tsx`. A "select all" header checkbox selects/deselects all visible rows. When rows are selected, `BulkActionBar` appears with three actions: "Verify Selected", "Reject Selected", "Request Info". Destructive actions (Reject) use `AlertDialog` confirmation. Mutations run in `Promise.all`.

### Required Reading

- `src/app/(admin)/admin/leads/page.tsx` — Read the full file before editing. Understand the current table structure, column definitions, and how mutations are called.
- `src/components/admin/BulkActionBar.tsx` — The component from T01
- `src/components/ui/checkbox.tsx` — Existing shadcn/ui Checkbox component
- `src/components/ui/alert-dialog.tsx` — Existing shadcn/ui AlertDialog component
- `convex/leads.ts` + `convex/verifications.ts` — Read to confirm the exact mutation names and argument shapes for `verifications.create`, `reject`, and `requestInfo` (or equivalent mutations)
- `notes/13-constants-reference.md` — `LEAD_STATUS` enum, `verifications.create` / `leads.reject` permission strings

### Key Rules

1. Read `src/app/(admin)/admin/leads/page.tsx` fully before making any changes.
2. Selection state: `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())`. Use a `Set` for O(1) toggle operations.
3. Add a checkbox column as the FIRST column in the table. Header cell: a `Checkbox` that is `checked` when all visible rows are selected, `indeterminate` when some are selected, and unchecked when none are. Row cell: a `Checkbox` that toggles the row's ID in `selectedIds`.
4. The "select all" checkbox uses the shadcn/ui `Checkbox` `checked` prop with a ternary: `checked={allSelected ? true : someSelected ? "indeterminate" : false}`. The `indeterminate` value is supported by shadcn/ui Checkbox.
5. Clear `selectedIds` when the filter or page changes (add `selectedIds` clear to the filter change handlers).
6. **Bulk actions**:
   - "Verify Selected": calls `useMutation(api.verifications.create)` for each selected ID. Run with `Promise.all`. On success: toast "X leads verified", clear selection. On any error: toast the error message, do NOT clear selection (so the user can retry).
   - "Reject Selected": requires `AlertDialog` confirmation ("Reject X leads? This cannot be undone."). On confirm: calls `useMutation(api.leads.reject)` for each. Same error handling.
   - "Request Info": calls `useMutation(api.leads.requestInfo)` (or equivalent) for each. No confirmation needed. Same error handling.
7. Only show actions that are valid for the current filter. If the current filter is `status=VERIFIED`, don't show "Verify Selected" (already verified). Check the current filter state and conditionally include actions in the `BulkActionBar` `actions` prop.
8. Use `useMutation` from `convex/react` — one `useMutation` call per mutation type at the component level, then call the returned function inside `Promise.all`.
9. Show a loading state on the action buttons while mutations are in-flight (disable buttons, show spinner). Use a `isBulkLoading` state.
10. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/app/(admin)/admin/leads/page.tsx` — Updated with checkbox column, select-all header, `selectedIds` state, `BulkActionBar` with 3 actions, `AlertDialog` for reject confirmation

### Acceptance Criteria

1. Each lead row has a checkbox in the first column
2. Header checkbox selects/deselects all visible rows; shows indeterminate when some are selected
3. `BulkActionBar` appears when 1+ rows are selected, disappears when selection is cleared
4. "Verify Selected" calls the verify mutation for all selected IDs and shows a success toast
5. "Reject Selected" shows an `AlertDialog` before calling the reject mutation
6. "Request Info" calls the requestInfo mutation for all selected IDs
7. Mutations run in `Promise.all` (parallel, not sequential)
8. Selection is cleared when filters change
9. Action buttons are disabled while mutations are in-flight
10. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/leads/page.tsx`.

### Out of Scope

- Bulk actions on other pages (T03, T04)
- Persisting selection across page navigation (V2)
- Bulk edit (change status to arbitrary value) (V2)
- Selecting rows across multiple pages (V2)

---

## T03: Add Row Selection and Bulk Actions to Payout Table

### Objective

Add checkbox selection and `BulkActionBar` to the payout table in `src/app/(admin)/admin/payouts/page.tsx`. Bulk actions: "Approve Selected" and "Void Selected". Only show actions relevant to the current filter (e.g., don't show "Approve" when viewing disbursed payouts).

### Required Reading

- `src/app/(admin)/admin/payouts/page.tsx` — Read the full file before editing. Understand the current table structure, filter state, and how mutations are called.
- `src/components/admin/BulkActionBar.tsx` — The component from T01
- `src/components/ui/checkbox.tsx` — Existing shadcn/ui Checkbox component
- `src/components/ui/alert-dialog.tsx` — Existing shadcn/ui AlertDialog component
- `convex/payouts.ts` — Read to confirm the exact mutation names and argument shapes for `approve` and `voidPayout` mutations
- `notes/13-constants-reference.md` — `PAYOUT_STATUS` enum, `payouts.approve` / `payouts.void` permission strings
- `notes/04-state-machines.md` — Payout status transitions (`pending` → `approved` → `disbursed`, with `failed`/`voided` terminal outcomes) — only `pending` payouts can be approved; `pending`/`approved` payouts can be voided

### Key Rules

1. Read `src/app/(admin)/admin/payouts/page.tsx` fully before making any changes.
2. Selection state: same `Set<string>` pattern as T02.
3. Add checkbox column as the FIRST column. Same select-all header checkbox pattern as T02.
4. **Context-aware actions** — derive which actions to show based on the current `status` filter:
   - Filter is `pending` (or no filter): show both "Approve Selected" and "Void Selected"
   - Filter is `approved`: show "Void Selected" only (can still void an approved payout)
   - Filter is `disbursed`, `failed`, or `voided`: show NO bulk actions (terminal states). In this case, still show the `BulkActionBar` with just the count and "Clear" button, but no action buttons.
   - No filter (all payouts): show both actions but note that they will fail for terminal-state payouts — handle errors gracefully per-item.
5. "Approve Selected": calls `useMutation(api.payouts.approve)` for each selected ID in `Promise.all`. On success: toast "X payouts approved", clear selection.
6. "Void Selected": requires `AlertDialog` confirmation. On confirm: calls `useMutation(api.payouts.voidPayout)` for each. Same error handling as T02.
7. Clear `selectedIds` when the filter changes.
8. Same loading state pattern as T02 (disable buttons, show spinner while in-flight).
9. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/app/(admin)/admin/payouts/page.tsx` — Updated with checkbox column, select-all header, `selectedIds` state, context-aware `BulkActionBar` with approve/void actions, `AlertDialog` for void confirmation

### Acceptance Criteria

1. Each payout row has a checkbox in the first column
2. Header checkbox selects/deselects all visible rows with indeterminate support
3. `BulkActionBar` appears when 1+ rows are selected
4. "Approve Selected" is only shown when the current filter includes approvable payouts (`pending`)
5. "Void Selected" shows an `AlertDialog` before calling the `voidPayout` mutation
6. Mutations run in `Promise.all`
7. Selection is cleared when filters change
8. No bulk actions are shown for terminal-state payouts (`disbursed`, `failed`, `voided`)
9. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/app/(admin)/admin/payouts/page.tsx`.

### Out of Scope

- Bulk payout disbursement (requires external payment integration — V2)
- Bulk void (V2)
- Selecting rows across multiple pages (V2)

---

## T04: Enhance Verification Table with BulkActionBar Pattern

### Objective

The verification table (`src/components/admin/VerificationTable.tsx`) already has some bulk operations from P27-E04. Replace or enhance the existing bulk UI with the `BulkActionBar` component for visual consistency. Ensure bulk verify and bulk reject use the same fixed-bottom bar pattern as T02 and T03.

### Required Reading

- `src/components/admin/VerificationTable.tsx` — Read the full file before editing. Understand what bulk operations already exist (from P27-E04), how selection state is managed, and what mutations are called.
- `src/components/admin/BulkActionBar.tsx` — The component from T01
- `src/app/(admin)/admin/verification/page.tsx` — Read to understand how `VerificationTable` is used in context
- `convex/verifications.ts` — Confirm the mutation names for bulk verify and bulk reject operations

### Key Rules

1. Read `src/components/admin/VerificationTable.tsx` AND `src/app/(admin)/admin/verification/page.tsx` fully before making any changes.
2. **Audit the existing bulk UI first.** P27-E04 may have added inline bulk action buttons above the table, a floating bar, or something else. Document what exists before replacing it.
3. If P27-E04 added a custom bulk action UI (not using `BulkActionBar`): replace it with `BulkActionBar`. Preserve all existing mutation calls and confirmation dialogs — only replace the UI wrapper.
4. If P27-E04 already uses a pattern similar to `BulkActionBar`: adapt `BulkActionBar` to accept the same props and swap it in, or confirm the existing pattern is close enough and just add the slide-up animation.
5. The `BulkActionBar` must be rendered at the page level (in `src/app/(admin)/admin/verification/page.tsx`), not inside `VerificationTable` — because `BulkActionBar` is `fixed bottom-0` and needs to be outside the table's scroll container. Pass `selectedIds`, `onClear`, and action handlers as props from the page to the table, and render `BulkActionBar` in the page.
6. Bulk actions to support (matching P27-E04 implementation): "Verify Selected" and "Reject Selected". Do NOT add new mutation calls — reuse what P27-E04 already implemented.
7. Clear `selectedIds` when the filter or tab changes.
8. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/components/admin/VerificationTable.tsx` — Updated to use `BulkActionBar` pattern (selection state lifted to page level if needed)
- [ ] `src/app/(admin)/admin/verification/page.tsx` — Updated to render `BulkActionBar` at page level with correct actions

### Acceptance Criteria

1. Verification table has row checkboxes and a select-all header checkbox
2. `BulkActionBar` appears at the bottom of the viewport when rows are selected
3. "Verify Selected" and "Reject Selected" actions work correctly (same behavior as P27-E04)
4. The bulk action UI is visually consistent with the lead and payout tables (same `BulkActionBar` component)
5. Selection is cleared when the filter/tab changes
6. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/VerificationTable.tsx` and `src/app/(admin)/admin/verification/page.tsx`.

### Out of Scope

- Adding new bulk actions beyond verify and reject (V2)
- Bulk actions on other admin tables not listed in this epic (V2)
- Selecting rows across multiple pages (V2)
