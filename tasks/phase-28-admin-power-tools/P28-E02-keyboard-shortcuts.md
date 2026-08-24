---
id: P28-E02
title: Keyboard Shortcuts + Help System
phase: 28
status: done
depends_on: []
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P28-E02: Keyboard Shortcuts + Help System

## Overview

Add a keyboard shortcut system to the admin panel that lets power users navigate and act without the mouse. Implements chord sequences (G→L for Leads, G→D for Dashboard, etc.), page-specific shortcuts (approve, reject, focus search), and a `?`-triggered help dialog showing all available shortcuts. Input-aware so shortcuts don't fire while the user is typing in a form field.

## Task Queue

- [x] P28-E02-T01: Create keyboard shortcuts registry with chord sequence support
- [x] P28-E02-T02: Create useKeyboardShortcuts hook and wire into admin layout
- [x] P28-E02-T03: Create keyboard shortcuts help dialog triggered by `?`

---

## T01: Create Keyboard Shortcuts Registry with Chord Sequence Support

### Objective

Create `src/lib/keyboard-shortcuts.ts` — a typed registry of all keyboard shortcuts with support for chord sequences (two-key combos like G→L). Includes the input-awareness check (ignore shortcuts when focus is inside a form field) and a 1-second chord timeout.

### Required Reading

- `src/app/(admin)/admin-layout-client.tsx` — Read the full file to understand the layout structure before adding anything
- `notes/06-admin-panel-ux.md` — "Sidebar Navigation" section (all admin pages and their paths — shortcuts must match)
- `lib/constants.ts` — Existing constants patterns (follow the same export style)

### Key Rules

1. The registry is a plain TypeScript module — no React, no hooks. It exports types and constants only. The hook (T02) imports from it.
2. Define a `ShortcutDefinition` type:
   ```typescript
   export type ShortcutDefinition = {
     id: string; // Unique identifier, e.g., "nav.leads"
     category: "Navigation" | "Actions" | "Global";
     label: string; // Human-readable, e.g., "Go to Leads"
     chord?: [string, string]; // Two-key chord, e.g., ["g", "l"]
     key?: string; // Single key, e.g., "?" or "/"
     description?: string; // Optional longer description for help dialog
   };
   ```
3. Define `KEYBOARD_SHORTCUTS: ShortcutDefinition[]` — the full registry. Include:
   - **Navigation chords** (category: "Navigation"): G→D (Dashboard), G→G (Guards), G→L (Leads), G→S (Societies), G→V (Visits), G→P (Payouts)
   - **Global single keys** (category: "Global"): `?` (Open shortcuts help), `/` (Focus search / open command palette)
   - **Action shortcuts** (category: "Actions"): `A` (Approve / Verify selected), `R` (Reject selected) — these are page-specific and only active on certain pages; the registry marks them but the hook decides when to activate them
4. The chord timeout is 1000ms. After the first key of a chord is pressed, if the second key is not pressed within 1000ms, the chord resets.
5. Input-awareness check — a helper function `isInputFocused(): boolean`:
   ```typescript
   export function isInputFocused(): boolean {
     const el = document.activeElement;
     if (!el) return false;
     const tag = el.tagName.toLowerCase();
     return (
       tag === "input" ||
       tag === "textarea" ||
       tag === "select" ||
       (el as HTMLElement).isContentEditable
     );
   }
   ```
   This function is called before processing any shortcut. If it returns `true`, the shortcut is ignored.
6. Export a `CHORD_TIMEOUT_MS = 1000` constant.
7. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/lib/keyboard-shortcuts.ts` — Typed registry with `ShortcutDefinition` type, `KEYBOARD_SHORTCUTS` array, `isInputFocused()` helper, `CHORD_TIMEOUT_MS` constant

### Acceptance Criteria

1. `ShortcutDefinition` type is exported and covers all required fields
2. `KEYBOARD_SHORTCUTS` array contains all 8+ shortcuts (6 navigation chords + 2 global + 2 action)
3. `isInputFocused()` returns `true` when an input/textarea/select/contenteditable is focused
4. `CHORD_TIMEOUT_MS` is exported as `1000`
5. `npx tsc --noEmit` passes with no errors

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/lib/keyboard-shortcuts.ts`.

### Out of Scope

- React hook (T02)
- Help dialog (T03)
- Page-specific shortcut activation logic (T02)

---

## T02: Create useKeyboardShortcuts Hook and Wire into Admin Layout

### Objective

Create `src/hooks/useKeyboardShortcuts.ts` — a React hook that reads the registry from T01, listens for keyboard events, handles chord sequences with the 1-second timeout, and calls registered action callbacks. Wire it into the admin layout so navigation shortcuts work on every admin page. Add page-specific shortcuts to the leads page.

### Required Reading

- `src/lib/keyboard-shortcuts.ts` — The registry from T01 (read before writing the hook)
- `src/app/(admin)/admin-layout-client.tsx` — Where the hook gets mounted for global shortcuts
- `src/app/(admin)/admin/leads/page.tsx` — Where page-specific shortcuts (`A`, `R`, `/`) get added
- `notes/06-admin-panel-ux.md` — "Flow 1: Lead Triage" section (what actions make sense on the leads page)

### Key Rules

1. The hook signature:
   ```typescript
   export function useKeyboardShortcuts(
     shortcuts: ShortcutDefinition[],
     handlers: Record<string, () => void>,
   ): void;
   ```
   `shortcuts` is a subset of `KEYBOARD_SHORTCUTS` to activate. `handlers` maps shortcut `id` to a callback function.
2. The hook attaches a `keydown` listener to `document` via `useEffect`. Clean up on unmount.
3. Chord state: use `useRef` (not `useState`) for the pending first key and the timeout ID — refs don't cause re-renders.
   ```typescript
   const pendingChordKey = useRef<string | null>(null);
   const chordTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
   ```
4. Chord logic:
   - On keydown: if `isInputFocused()` → return early.
   - If `pendingChordKey.current` is set: check if the pressed key matches the second key of any chord starting with `pendingChordKey.current`. If match → call the handler, clear pending state. If no match → clear pending state (chord failed).
   - If no pending chord: check if the pressed key is the first key of any chord. If yes → set `pendingChordKey.current`, start a `CHORD_TIMEOUT_MS` timeout to clear it. Also check if the key matches any single-key shortcut → call handler immediately.
5. In `admin-layout-client.tsx`, call `useKeyboardShortcuts` with the navigation shortcuts and handlers that call `router.push(path)` for each page. Also include the `?` shortcut handler (opens the help dialog from T03) and `/` handler (opens the command palette from E01).
6. **Page-specific shortcuts on the leads page** (`src/app/(admin)/admin/leads/page.tsx`):
   - `A` key: calls the "approve/verify selected" action (only if rows are selected — check selection state before acting)
   - `R` key: calls the "reject selected" action (only if rows are selected)
   - `/` key: focuses the search input on the page (call `.focus()` on the search input ref)
     These are passed as additional shortcuts to `useKeyboardShortcuts` called within the leads page component.
7. The `G` key alone must NOT trigger navigation — it only starts a chord. Suppress the default browser behavior for `G` only when it's the first key of a chord (to prevent the browser's "find" shortcut from firing).
8. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/hooks/useKeyboardShortcuts.ts` — Hook with chord sequence handling, input-awareness, timeout cleanup
- [ ] `src/app/(admin)/admin-layout-client.tsx` — Updated to call `useKeyboardShortcuts` with navigation shortcuts and handlers
- [ ] `src/app/(admin)/admin/leads/page.tsx` — Updated to call `useKeyboardShortcuts` with page-specific shortcuts (`A`, `R`, `/`)

### Acceptance Criteria

1. Pressing `G` then `L` within 1 second navigates to `/admin/leads`
2. Pressing `G` then `D` within 1 second navigates to `/admin/dashboard`
3. Pressing `G` then `G` within 1 second navigates to `/admin/guards`
4. Pressing `G` then `V` within 1 second navigates to `/admin/visits`
5. Pressing `G` then `P` within 1 second navigates to `/admin/payouts`
6. Pressing `G` then `S` within 1 second navigates to `/admin/societies`
7. Pressing `G` then waiting 1+ seconds resets the chord (no navigation)
8. Shortcuts do NOT fire when focus is inside an input, textarea, or select
9. On the leads page, pressing `A` with selected rows triggers verify action; `R` triggers reject
10. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/hooks/useKeyboardShortcuts.ts`, `src/app/(admin)/admin-layout-client.tsx`, and `src/app/(admin)/admin/leads/page.tsx`.

### Out of Scope

- Help dialog (T03)
- Page-specific shortcuts on pages other than leads (can be added incrementally)
- Shortcut customization by the user (V2)
- Shortcut conflict detection (V2)

---

## T03: Create Keyboard Shortcuts Help Dialog

### Objective

Create `src/components/admin/KeyboardShortcutsDialog.tsx` — a Dialog that opens when the user presses `?` and shows all available shortcuts grouped by category (Navigation, Actions, Global). Add a `?` hint in the admin sidebar footer.

### Required Reading

- `src/lib/keyboard-shortcuts.ts` — The registry from T01 (the dialog reads from this to render shortcuts)
- `src/app/(admin)/admin-layout-client.tsx` — Where the dialog gets mounted and the sidebar footer hint gets added
- `src/components/ui/dialog.tsx` — Existing shadcn/ui Dialog component (use it, don't create a new modal)
- `notes/06-admin-panel-ux.md` — "Global Layout" section (sidebar footer area)

### Key Rules

1. The dialog is a client component (`"use client"`). It accepts `open: boolean` and `onOpenChange: (open: boolean) => void` props — the parent layout controls the open state (the `?` shortcut handler from T02 calls `setHelpOpen(true)`).
2. Use shadcn/ui `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` for the modal structure.
3. Dialog title: `"Keyboard Shortcuts"`.
4. Content layout: 3 columns on desktop (`grid-cols-3`), 1 column on mobile (`grid-cols-1`). One column per category: "Navigation", "Actions", "Global".
5. Each shortcut row: left side shows the key(s) in `<kbd>` elements, right side shows the label. Style `<kbd>` with `text-xs bg-muted border border-border px-1.5 py-0.5 rounded font-mono`. For chords, show two `<kbd>` elements with `then` text between them: `<kbd>G</kbd> then <kbd>L</kbd>`.
6. Read shortcuts from `KEYBOARD_SHORTCUTS` (imported from `src/lib/keyboard-shortcuts.ts`). Group by `category` field. Do NOT hardcode the shortcut list in the dialog — it must stay in sync with the registry automatically.
7. **Sidebar footer hint**: In `src/app/(admin)/admin-layout-client.tsx`, add a small text hint at the bottom of the sidebar: `Press ? for shortcuts`. Style: `text-xs text-muted-foreground text-center py-2`. Clicking it also opens the help dialog.
8. The dialog closes on Escape (shadcn/ui Dialog handles this automatically).
9. No `as any`, no `@ts-ignore`, no `@ts-expect-error`.

### Deliverables

- [ ] `src/components/admin/KeyboardShortcutsDialog.tsx` — Help dialog reading from `KEYBOARD_SHORTCUTS` registry, 3-column grid layout
- [ ] `src/app/(admin)/admin-layout-client.tsx` — Updated to mount `KeyboardShortcutsDialog`, manage `helpOpen` state, and add sidebar footer hint

### Acceptance Criteria

1. Pressing `?` anywhere in the admin panel (when not in an input) opens the dialog
2. Dialog shows all shortcuts from `KEYBOARD_SHORTCUTS` grouped by category
3. Navigation shortcuts show chord format: `G then L`
4. Single-key shortcuts show a single `<kbd>` element
5. Dialog is 3 columns on desktop, 1 column on mobile
6. Sidebar footer shows `"Press ? for shortcuts"` text that opens the dialog on click
7. Dialog closes on Escape
8. `npx tsc --noEmit` passes

### Verification

```bash
npx tsc --noEmit
```

Run `lsp_diagnostics` on `src/components/admin/KeyboardShortcutsDialog.tsx` and `src/app/(admin)/admin-layout-client.tsx`.

### Out of Scope

- Shortcut customization (V2)
- Animated shortcut demo on hover (V2)
- Shortcut search within the help dialog (V2)
- Printing the shortcut list (V2)
