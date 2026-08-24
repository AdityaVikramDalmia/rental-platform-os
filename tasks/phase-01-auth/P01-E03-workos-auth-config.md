---
id: P01-E03
title: WorkOS Auth Configuration
phase: 1
status: done
depends_on: ["P01-E02"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-17
---

# P01-E03: WorkOS Auth Configuration

## Overview
Configure WorkOS JWT validation in Convex, set up the AuthKit component with user lifecycle event handlers, register HTTP routes for webhooks, create the ConvexClientProvider that bridges WorkOS tokens to Convex, and wire it into the root layout with theme and toast providers.

## Task Queue
- [x] P01-E03-T01: Create convex/auth.config.ts
- [x] P01-E03-T02: Create convex/auth.ts (AuthKit Component + Event Handlers)
- [x] P01-E03-T03: Create convex/http.ts (Register AuthKit Routes + Listing Endpoint Placeholder)
- [x] P01-E03-T04: Create ConvexClientProvider Component
- [x] P01-E03-T05: Wire ConvexClientProvider into Root Layout

---

## Completion Summary

**Completed**: 2026-02-17

### What Was Built

| File | Lines | Purpose |
|------|-------|---------|
| `convex/auth.config.ts` | 20 | Two customJwt providers (SSO + User Management) for WorkOS JWT validation |
| `convex/auth.ts` | 46 | AuthKit instance + user.created/user.updated event handlers with guard/admin detection |
| `convex/http.ts` | 32 | HTTP router with AuthKit webhook routes (POST /workos/webhook, /workos/action) |
| `src/components/shared/ConvexClientProvider.tsx` | 50 | Client-side auth bridge: AuthKitProvider → ConvexProviderWithAuth with token caching |
| `src/app/layout.tsx` | 48 | Root layout with ConvexClientProvider, ThemeProvider (next-themes), Toaster (sonner) |

### Key Decisions & Deviations

1. **Manual JWT providers vs `getAuthConfigProviders()`**: Used manual provider definitions in auth.config.ts instead of the library's helper method. Both approaches are functionally equivalent, but manual avoids a circular dependency (auth.config.ts → auth.ts).
2. **Guard detection by email**: `user.created` handler detects guard vs admin by checking if email ends with `@guards.local`. Guards get `must_change_password: true`, admins get `false`.
3. **Type assertion on `internal.auth`**: auth.ts uses a narrow type assertion `(internal as typeof internal & { auth: AuthFunctions }).auth` because generated types aren't fully populated until all Convex functions are defined. This is safe and temporary.
4. **Token caching in ConvexClientProvider**: `useAuthFromAuthKit` caches access tokens via `useRef` and falls back to cached token on fetch errors — never throws.
5. **Turbopack config**: Removed webpack config added for reference/ exclusion, replaced with empty `turbopack: {}` for Next.js 16 compatibility. Reference/ exclusion handled via tsconfig.json exclude instead.
6. **WorkOS env vars**: Required setting `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_WEBHOOK_SECRET` in Convex runtime via `npx convex env set` for the push to succeed. These must be set before any Convex push with the auth module.

### Gotchas for Next Epics (P01-E04, E05, E06)

- **Convex env vars required**: WorkOS environment variables MUST be set in the Convex runtime (via `npx convex env set`) before pushing. Without them, the AuthKit constructor throws at module load time.
- **`WORKOS_WEBHOOK_SECRET`**: Currently a placeholder. Must be replaced with the real secret from WorkOS Dashboard when configuring webhooks.
- **Import paths**: `useAuth`/`useAccessToken` are imported from `@workos-inc/authkit-nextjs/components` (not the package root).
- **auth.ts exports**: `authKit` (the AuthKit instance) and `authKitEvent` (mutation handler for webhook events).
- **Audit triggers fire**: User creation/update via event handlers goes through `ctx.db` which triggers audit logging automatically.
- **Build command**: `npm run build` uses Turbopack (Next.js 16 default). No `--webpack` flag needed.

### Verification

```
npx convex dev --once --typecheck=enable  → ✅ success (after setting env vars)
npm run test → ✅ 5/5 passed (470ms)
npm run build → ✅ success (Turbopack, 1.9s compile)
```

---

## T01: Create convex/auth.config.ts

### Objective
Configure Convex to validate WorkOS JWTs from both SSO (admin Google login) and User Management (guard email+password login) providers so both roles can authenticate.

### Required Reading
- `notes/01-tech-stack.md` — "Key Integration Code Patterns" section (auth.config.ts example at lines 117-134)
- `notes/01-tech-stack.md` — "Environment Variables" section (WORKOS_CLIENT_ID)

### Key Rules
1. Two `customJwt` providers required: SSO issuer (`https://api.workos.com/`) and User Management issuer (`https://api.workos.com/user_management/${clientId}`)
2. Both use RS256 algorithm and the same JWKS endpoint: `https://api.workos.com/sso/jwks/${clientId}`
3. `WORKOS_CLIENT_ID` MUST come from `process.env` — never hardcode the client ID
4. Both providers require the `applicationID` field set to the client ID

### Deliverables
- [ ] `convex/auth.config.ts` — Default export with two customJwt providers configured

### Acceptance Criteria
1. File exports a default config object with exactly 2 providers
2. Both providers reference `WORKOS_CLIENT_ID` from `process.env`
3. SSO provider has issuer `https://api.workos.com/`
4. User Management provider has issuer `https://api.workos.com/user_management/${clientId}`
5. TypeScript compiles clean

### Verification
```bash
npx tsc --noEmit
```
Run `lsp_diagnostics` on `convex/auth.config.ts` — expect zero errors.

### Out of Scope
- Auth helpers (requireGuard, requireAdmin, etc.) — separate epic P01-E02
- Login UI — separate epic P01-E04
- WorkOS dashboard configuration (manual step, not code)

---

## T02: Create convex/auth.ts (AuthKit Component + Event Handlers)

### Objective
Instantiate the AuthKit component and implement user lifecycle event handlers that auto-create Convex user records when WorkOS users are created or updated, detecting guard vs admin by email suffix.

### Required Reading
- `notes/01-tech-stack.md` — "Key Integration Code Patterns" section (auth.ts example at lines 138-173)
- `notes/11-convex-architecture.md` — "AuthKit Component" section (lines 162-211)
- `notes/01-tech-stack.md` — "User Sync" subsection (user.created, user.updated, user.deleted events)

### Key Rules
1. Import `AuthKit` and `AuthFunctions` from `@convex-dev/workos-authkit`
2. Use `components.workOSAuthKit` from auto-generated API for the component reference
3. Guard detection: email ending with `@guards.local` → `user_type: "GUARD"`, else `user_type: "ADMIN"`
4. Guards get `must_change_password: true` (they receive a temp password from admin)
5. Admins get `must_change_password: false` (they log in via Google SSO)
6. Name construction: `"${firstName ?? ""} ${lastName ?? ""}".trim()`
7. `user.updated` handler: look up user by `workos_user_id` index, patch email + name
8. Export `authKit` instance (imported by `auth.helpers.ts`, `http.ts`)
9. Export `authKitEvent` from `authKit.events()` (required for webhook processing)

### Deliverables
- [ ] `convex/auth.ts` — AuthKit instance + `user.created` and `user.updated` event handlers

### Acceptance Criteria
1. `authKit` is exported and typed as `AuthKit<DataModel>`
2. `user.created` handler inserts into `users` table with correct `user_type` based on email suffix
3. `user.created` handler sets `must_change_password: true` for guards, `false` for admins
4. `user.updated` handler patches email and name on existing user record
5. `authKitEvent` is exported for webhook route registration
6. TypeScript compiles clean

### Verification
```bash
npx tsc --noEmit
```
Run `lsp_diagnostics` on `convex/auth.ts` — expect zero errors.

### Out of Scope
- `user.deleted` handler (soft delete — implement when needed in a later phase)
- Guard profile creation on `user.created` (handled by guard management epic P03)
- Auth helpers that consume `authKit.getAuthUser()` — separate file `auth.helpers.ts`

---

## T03: Create convex/http.ts (Register AuthKit Routes + Listing Endpoint Placeholder)

### Objective
Create the Convex HTTP router that registers AuthKit webhook and action routes, enabling WorkOS to send user lifecycle events to Convex. Include a commented-out placeholder for the future public listing endpoint.

### Required Reading
- `notes/01-tech-stack.md` — "Key Integration Code Patterns" section (http.ts example at lines 177-186)
- `notes/11-convex-architecture.md` — "HTTP Router (Public Endpoints)" section (lines 409-447)

### Key Rules
1. Import `httpRouter` from `"convex/server"`
2. Import `authKit` from `"./auth"` (the instance created in T02)
3. Call `authKit.registerRoutes(http)` to register `POST /workos/webhook` and `POST /workos/action` endpoints
4. The listing endpoint is NOT implemented here — add a comment referencing the future location
5. Default export the `http` router

### Deliverables
- [ ] `convex/http.ts` — HTTP router with AuthKit routes registered and listing endpoint placeholder comment

### Acceptance Criteria
1. `authKit.registerRoutes(http)` is called
2. Router is default exported
3. Comment indicates where public listing endpoint will go (referencing `notes/11-convex-architecture.md`)
4. TypeScript compiles clean

### Verification
```bash
npx tsc --noEmit
```
Run `lsp_diagnostics` on `convex/http.ts` — expect zero errors.

### Out of Scope
- Public listing endpoint implementation (Phase 6 — Listings)
- Any other HTTP routes
- CORS configuration (not needed — Convex handles this)

---

## T04: Create ConvexClientProvider Component

### Objective
Create the client-side provider component that bridges WorkOS AuthKit sessions to Convex authentication, enabling all Convex queries and mutations to receive the authenticated user context.

### Required Reading
- `notes/01-tech-stack.md` — "Key Integration Code Patterns" section (ConvexClientProvider example at lines 189-225)
- `notes/01-tech-stack.md` — "Session Management" subsection

### Key Rules
1. File path: `src/components/shared/ConvexClientProvider.tsx`
2. Must be a `"use client"` component
3. Use `AuthKitProvider` from `@workos-inc/authkit-nextjs/components` as outer wrapper
4. Use `ConvexProviderWithAuth` from `convex/react` with custom `useAuthFromAuthKit` hook
5. `useAuthFromAuthKit` must use `useAuth()` for user/loading state and `useAccessToken()` for token management
6. `fetchAccessToken` callback: when `forceRefreshToken` is true, call `refresh()`; otherwise call `getAccessToken()`
7. On token fetch error, fall back to cached `accessTokenRef.current` — never throw from `fetchAccessToken`
8. Convex client URL from `process.env.NEXT_PUBLIC_CONVEX_URL`
9. `AuthKitProvider` `onSessionExpired` can be a no-op for V1 (session lasts 30 days)

### Deliverables
- [ ] `src/components/shared/ConvexClientProvider.tsx` — Provider component with WorkOS↔Convex auth bridge

### Acceptance Criteria
1. Component wraps children with `AuthKitProvider` → `ConvexProviderWithAuth` in correct nesting order
2. `useAuthFromAuthKit` returns `{ isLoading, isAuthenticated, fetchAccessToken }` matching Convex's expected auth interface
3. `fetchAccessToken` handles both normal and force-refresh flows
4. `fetchAccessToken` catches errors and falls back to cached token (no unhandled rejections)
5. ConvexReactClient is created once via `useState` (not recreated on re-render)
6. TypeScript compiles clean

### Verification
```bash
npx tsc --noEmit
```
Run `lsp_diagnostics` on `src/components/shared/ConvexClientProvider.tsx` — expect zero errors.

### Out of Scope
- Root layout integration (T05 handles that)
- Theme provider or toast provider (T05 handles that)
- Guard/admin role checking (that happens in layouts, not the provider)

---

## T05: Wire ConvexClientProvider into Root Layout

### Objective
Update the root layout to wrap all pages with ConvexClientProvider, add theme support via next-themes, add sonner toast notifications, and configure fonts (Geist Sans + Geist Mono).

### Required Reading
- `notes/01-tech-stack.md` — "Frontend Architecture" section (shadcn/ui + Tailwind subsection)
- `notes/01-tech-stack.md` — "Client-Side Libraries" table (next-themes, sonner)
- `notes/01-tech-stack.md` — "Tailwind v4 + shadcn/ui" subsection (Geist fonts, new-york variant)

### Key Rules
1. File path: `src/app/layout.tsx`
2. Import `ConvexClientProvider` from `@/components/shared/ConvexClientProvider`
3. Add `ThemeProvider` from `next-themes` with `attribute="class"` and `defaultTheme="system"`
4. Add `Toaster` from `sonner` (global toast notifications — every mutation error/success uses this)
5. Import Geist Sans and Geist Mono via `next/font/google` (or `next/font/local` if bundled)
6. Apply font CSS variables to `<body>`: `--font-geist-sans` and `--font-geist-mono`
7. Nesting order (outer → inner): `<html>` → `<body>` → `ConvexClientProvider` → `ThemeProvider` → `{children}` + `Toaster`
8. Set `suppressHydrationWarning` on `<html>` (required by next-themes)

### Deliverables
- [ ] `src/app/layout.tsx` — Root layout with ConvexClientProvider, ThemeProvider, Toaster, and Geist fonts

### Acceptance Criteria
1. `ConvexClientProvider` wraps all page content
2. `ThemeProvider` enables dark mode toggling via class attribute
3. `Toaster` from sonner is rendered (allows `toast.success()` / `toast.error()` from anywhere)
4. Geist Sans and Geist Mono fonts are loaded and applied via CSS variables
5. `suppressHydrationWarning` is set on `<html>` element
6. `npm run build` succeeds without errors

### Verification
```bash
npm run build
```
Run `lsp_diagnostics` on `src/app/layout.tsx` — expect zero errors. Visually confirm fonts render in browser dev tools.

### Out of Scope
- Guard portal layout (`src/app/(guard)/layout.tsx`) — separate epic
- Admin panel layout (`src/app/(admin)/layout.tsx`) — separate epic
- Middleware for route protection — separate task
- i18n provider setup (Phase 14)
