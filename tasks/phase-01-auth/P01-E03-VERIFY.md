---
epic_id: P01-E03
title: "WorkOS Auth Configuration Verification"
type: code
status: pending
depends_on_epic: P01-E03
verified_at: null
failures: 0
---

# P01-E03 Verification: WorkOS Auth Configuration

## Readiness Gates

- [ ] Epic frontmatter shows `status: done` in `tasks/phase-01-auth/P01-E03-workos-auth-config.md`
- [ ] Completion Summary exists and deviations are reviewed before execution
- [ ] Dev server running: `npm run dev:force` (http://localhost:3000)
- [ ] Convex dev running: `npx convex dev` (http://127.0.0.1:3210)
- [ ] Required Convex env vars set: `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_WEBHOOK_SECRET`
- [ ] Seed data loaded: `npx convex run seed:init`
- [ ] Test login route reachable: http://localhost:3000/dev/login
- [ ] Test admin account available: `admin@example.com` / `DevAdmin123!`
- [ ] Test guard account available: `9999999999@guards.local` / `DevGuard123!`

---

## Code Verification

```bash
# Type safety
npx tsc --noEmit

# Build
npm run build

# Tests
npm run test -- convex/auth.test.ts src/app/callback/__tests__/route.test.ts

# Convex auth modules push/typecheck
npx convex dev --once --typecheck=enable
```

**Expected**: All commands exit 0. If a listed test file is not present yet, record that in Results.

---

## Scenarios

### V01: Convex Auth Config Defines Dual WorkOS JWT Providers — AC Ref: T01-AC1, T01-AC2, T01-AC3, T01-AC4, T01-AC5

**Precondition**: `convex/auth.config.ts` exists and env vars are available.

**Actions**:

1. Inspect exported auth config object in `convex/auth.config.ts`.
2. Verify provider count and issuer values for SSO and User Management.
3. Verify provider fields source `WORKOS_CLIENT_ID` from environment.
4. Run TypeScript check.

**Assert**:

- [ ] Config exports exactly two JWT providers.
- [ ] Both providers use `WORKOS_CLIENT_ID` from environment.
- [ ] SSO provider issuer is `https://api.workos.com/`.
- [ ] User Management issuer is `https://api.workos.com/user_management/${clientId}`.
- [ ] TypeScript compiles cleanly.

**Evidence**: file snapshot + terminal output

---

### V02: AuthKit Event Handlers Sync Users Correctly — AC Ref: T02-AC1, T02-AC2, T02-AC3, T02-AC4, T02-AC5, T02-AC6

**Precondition**: `convex/auth.ts` exists and auth component imports resolve.

**Actions**:

1. Inspect `authKit` export typing and instance creation.
2. Inspect `user.created` logic for guard/admin email-suffix routing.
3. Inspect `must_change_password` values for guard vs admin inserts.
4. Inspect `user.updated` logic for patching name/email.
5. Verify `authKitEvent` export exists.
6. Run TypeScript check.

**Assert**:

- [ ] `authKit` export exists and is correctly typed.
- [ ] `user.created` creates guard/admin user types by email suffix.
- [ ] Guard insert sets `must_change_password: true`; admin insert sets `false`.
- [ ] `user.updated` patches existing user email/name.
- [ ] `authKitEvent` is exported for webhooks.
- [ ] TypeScript compiles cleanly.

**Evidence**: file snapshot + terminal output

---

### V03: HTTP Router Registers AuthKit Routes — AC Ref: T03-AC1, T03-AC2, T03-AC3, T03-AC4

**Precondition**: `convex/http.ts` exists and imports `authKit`.

**Actions**:

1. Inspect router setup in `convex/http.ts`.
2. Confirm `authKit.registerRoutes(http)` is called.
3. Confirm router is default-exported.
4. Confirm listing endpoint placeholder comment exists.
5. Run TypeScript check.

**Assert**:

- [ ] AuthKit routes are registered on HTTP router.
- [ ] Router is default exported.
- [ ] Future listing endpoint location is documented with comment.
- [ ] TypeScript compiles cleanly.

**Evidence**: file snapshot + terminal output

---

### V04: ConvexClientProvider Bridges WorkOS Session to Convex — AC Ref: T04-AC1, T04-AC2, T04-AC3, T04-AC4, T04-AC5, T04-AC6

**Precondition**: `src/components/shared/ConvexClientProvider.tsx` exists and build dependencies are installed.

**Actions**:

1. Inspect provider nesting (`AuthKitProvider` -> `ConvexProviderWithAuth`).
2. Inspect `useAuthFromAuthKit` return object shape.
3. Inspect `fetchAccessToken` force-refresh path and normal path.
4. Inspect token error handling and cached-token fallback.
5. Inspect Convex client initialization to confirm single instance via `useState`.
6. Run TypeScript check.

**Assert**:

- [ ] Provider nesting order is correct.
- [ ] Hook returns `isLoading`, `isAuthenticated`, and `fetchAccessToken`.
- [ ] Token fetch supports force-refresh and standard retrieval.
- [ ] Token fetch errors are caught and fallback token is returned.
- [ ] Convex client is not recreated on every render.
- [ ] TypeScript compiles cleanly.

**Evidence**: file snapshot + terminal output

---

### V05: Root Layout Wiring Includes Auth, Theme, and Toast Providers — AC Ref: T05-AC1, T05-AC2, T05-AC3, T05-AC4, T05-AC5, T05-AC6

**Precondition**: `src/app/layout.tsx` exists and app builds locally.

**Actions**:

1. Inspect root layout for `ConvexClientProvider` wrapping all content.
2. Inspect `ThemeProvider` configuration (`attribute="class"`, `defaultTheme="system"`).
3. Confirm `Toaster` is rendered globally.
4. Confirm Geist Sans and Geist Mono are loaded and applied via CSS variables.
5. Confirm `<html suppressHydrationWarning>` is set.
6. Run `npm run build`.

**Assert**:

- [ ] Convex provider wraps application content.
- [ ] Theme provider config matches spec.
- [ ] Sonner toaster is globally available.
- [ ] Geist fonts are loaded and applied.
- [ ] Hydration warning suppression is enabled on html root.
- [ ] Build succeeds.

**Evidence**: file snapshot + terminal output

---

## Results

| ID  | Status  | Evidence | Notes |
| --- | ------- | -------- | ----- |
| V01 | pending | —        | —     |
| V02 | pending | —        | —     |
| V03 | pending | —        | —     |
| V04 | pending | —        | —     |
| V05 | pending | —        | —     |

---

## Failure Reports
