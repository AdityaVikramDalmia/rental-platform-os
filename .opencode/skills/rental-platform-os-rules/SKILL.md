---
name: rental-platform-os-rules
description: Non-negotiable Rental Platform OS project conventions — data formats, status transitions, permissions, and constraints that every agent MUST follow to avoid bugs.
license: MIT
---

# Rental Platform OS Project Rules

These rules are HARD constraints. Violating any of them produces bugs. Follow them in every mutation, query, and UI component you write.

## Data Format Rules

### Money — Always Paise

- Store as **integer paise** (× 100). ₹25,000 = `2500000`. ₹8,333.33 = `833333`.
- **No floats.** Use `Math.round()` when converting from rupee input.
- Display: divide by 100, format with `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })`.
- Utility: `lib/money.ts` — `rupeesToPaise()`, `paiseToRupees()`, `formatINR()`.

### Phone Numbers — Always 10 Digits

- Store as **10 digits only** (e.g., `9876543210`). No +91, no spaces, no dashes.
- Strip all formatting on input using `normalizePhone()` from `lib/validators.ts`.
- Display: add `+91` prefix only in UI: `formatPhoneDisplay()` → `+91 98765 43210`.
- Guard synthetic email: `{phone}@guards.local`.

### Dates — Always Unix Milliseconds

- Store as **`v.number()`** — `Date.now()` returns Unix ms. No string dates anywhere.
- Display: convert to locale format in frontend only.
- Utility: `lib/dates.ts`.

### Soft Delete — Never Hard Delete

- Entities with `is_deleted: boolean`: `buildings`, `guard_shifts`, `roles`, `user_role_assignments`, `listing_photos`.
- **Every query on these tables MUST filter**: `.filter(q => q.neq(q.field("is_deleted"), true))`.
- "Delete" mutations set `is_deleted: true`. Never call `ctx.db.delete()`.
- Entities WITHOUT `is_deleted` (use status instead): `societies`, `users`, `leads`, `listings`, `visits`, `closures`, `payouts`.

### Flat Numbers — Uppercase

- Always store flat numbers as UPPERCASE: `args.flat_number.toUpperCase()`.
- Validate against building's `flat_number_template` if defined.

## Status Transition Rules

**EVERY status-changing mutation MUST validate the transition is legal.**

### Lead Status

```
SUBMITTED → NEED_INFO, VERIFIED, REJECTED
NEED_INFO → SUBMITTED, REJECTED
POTENTIAL_DUPLICATE → DUPLICATE, SUBMITTED
VERIFIED → (no outgoing transitions — but can be REJECTED via separate action)
REJECTED → (terminal)
DUPLICATE → (terminal)
```

- New leads: `SUBMITTED` (normal) or `POTENTIAL_DUPLICATE` (if de-dup match).
- **Two-step duplicate flow**: POTENTIAL_DUPLICATE → SUBMITTED (clear flag) → then verify. NO direct POTENTIAL_DUPLICATE → VERIFIED.
- Only `VERIFIED` leads can have listings, visits, or closures.

### Visit Status

```
ASSIGNED → CONFIRMED, IN_PROGRESS, CANCELLED, NO_SHOW
CONFIRMED → IN_PROGRESS, CANCELLED, NO_SHOW
IN_PROGRESS → COMPLETED
COMPLETED, CANCELLED, NO_SHOW → (terminal)
```

- Guard can start visit from ASSIGNED (skip confirm): ASSIGNED → IN_PROGRESS is valid.
- On COMPLETED: `outcome` (INTERESTED/NOT_INTERESTED/FOLLOWUP) required.

### Listing Status

```
DRAFT → PUBLISHED
PUBLISHED → ARCHIVED, DRAFT
ARCHIVED → DRAFT
```

- At least 1 photo required to publish.
- If source lead is REJECTED, listing auto-archives.

### Closure Status

```
PENDING → CONFIRMED, CANCELLED
CONFIRMED, CANCELLED → (terminal)
```

- Payout can only be created after closure is CONFIRMED.
- If closure CANCELLED and payout is INITIATED → void the payout.

### Payout Status

```
INITIATED → APPROVED
APPROVED → PAID
PAID → (terminal)
```

### Society Status

```
ONBOARDING → ACTIVE (requires ≥1 building)
ACTIVE ↔ INACTIVE
```

### Guard/User Status

```
ACTIVE ↔ INACTIVE
ACTIVE → BANNED (requires reason)
INACTIVE → BANNED (requires reason)
BANNED → ACTIVE, INACTIVE (admin reinstatement)
```

## Auth & Permission Rules

### Guard Functions

- Use `requireGuard(ctx)` — checks auth, checks `user_type === "GUARD"`, checks `status === "ACTIVE"`.
- Guards can ONLY access their own data (own leads, own visits, own earnings, own profile).
- Guards CANNOT access admin functions. Period.

### Admin Functions

- Use `requirePermission(ctx, "permission.string")` — checks auth, checks admin, checks RBAC.
- Every admin mutation/query MUST specify the exact permission it requires.
- Permission strings are dot-notation: `leads.view`, `guards.create`, `payouts.approve`, etc.

### Auth Patterns

```typescript
// Guard function:
const guard = await requireGuard(ctx);

// Admin function with permission:
const admin = await requirePermission(ctx, "leads.verify");

// Admin function (any admin):
const admin = await requireAdmin(ctx);
```

## Import Rules

### Convex Functions

- **ALWAYS** import `mutation`, `internalMutation` from `./functions.ts` (audit triggers).
- **NEVER** import from `_generated/server` directly (bypasses audit).
- Queries can use `rawQuery` since they don't need triggers.

### Type Safety

- No `as any`. No `@ts-ignore`. No `@ts-expect-error`. Ever.
- No empty catch blocks `catch(e) {}`.

## Rate Limiting

- Guard lead submission: 5/day (configurable via `system_config.max_leads_per_guard_per_day`).
- Server-enforced via `@convex-dev/rate-limiter`. Client shows remaining count.
- Public listing inquiry: 5/hour/IP.

## De-Duplication Rules

Auto-flagged on lead submission (server-side, in mutation):

1. **Same flat**: same `society_id` + `building_id` + `flat_number` within 90 days, status not REJECTED/DUPLICATE.
2. **Same phone**: same `owner_phone` in same `society_id` within 30 days, status not REJECTED/DUPLICATE.

De-dup does NOT block — sets status to `POTENTIAL_DUPLICATE` with quality flags.

## UI Conventions

### Guard Portal (Mobile-First)

- Sticky rule banner on EVERY page. Non-dismissable. 48px amber bar.
- Bottom navigation: Home, Add, Leads, Visits, Earn.
- Touch targets: minimum 44×44px. Font: minimum 16px body.
- Use `sonner` for toasts. Use `react-hook-form` + `zod` for forms.

### Admin Panel (Desktop-First)

- Sidebar navigation (collapsible). Items hidden by RBAC permissions.
- Tables: 20 items/page, column sorting, filter bar, real-time via Convex subscriptions.
- Side panel for detail views (40% width on desktop).

### Both

- Loading: centered spinner. Mutation in progress: button spinner + disabled.
- Errors: toast via `sonner` for mutation failures. Inline red text for validation.

## PWA / Build Rules

### Build Command

- **Dev mode**: `npm run dev` uses Turbopack. Service worker does NOT compile in dev. This is expected.
- **Production build**: `npm run build` uses `--webpack` flag. Serwist requires webpack to compile `src/app/sw.ts` → `public/sw.js`.
- **Preview command**: `npm run preview` runs `npm run build && next start -p 3000` for production-like local PWA checks.
- **Never** commit generated worker artifacts (`public/sw.js`, `public/sw.js.map`, `public/swe-worker-*.js`, `public/swe-worker-*.js.map`) — they're in `.gitignore`.
- **TypeScript guardrail**: `tsconfig.json` excludes `src/app/sw.ts` to avoid service-worker global type collisions in app code.

### Manifest Convention

- Guard manifest: `/manifest-guard.webmanifest` — amber theme, scope `/guard/`
- Admin manifest: `/manifest-admin.webmanifest` — blue theme, scope `/admin/`
- Portal layouts (`(guard)/layout.tsx`, `(admin)/layout.tsx`) link to their respective manifests via Next.js `metadata` export.
- Login pages (under `(auth)/`) do NOT have portal manifests — users install from authenticated portal pages.

### Offline Behavior

- The service worker DOES NOT intercept Convex WebSocket traffic. Real-time subscriptions work normally when online.
- When offline, navigating to any page shows `~offline/page.tsx` as a fallback.
- `/~offline` is in the proxy.ts unauthenticated paths list — no auth required for the offline page.
- `next.config.ts` precaches `/~offline` via `withSerwistInit(...additionalPrecacheEntries...)` so fallback content is available offline.
