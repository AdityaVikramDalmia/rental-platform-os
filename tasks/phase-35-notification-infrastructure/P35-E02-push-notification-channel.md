---
id: P35-E02
title: Push Notification Channel
phase: 35
status: pending
depends_on: ["P35-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api", "frontend-ui-ux"]
updated_at: 2026-02-19
---

# P35-E02: Push Notification Channel

## Task Queue

- [ ] P35-E02-T01: Implement Web Push subscription storage and lifecycle
- [ ] P35-E02-T02: Integrate Serwist service worker push handlers
- [ ] P35-E02-T03: Wire push dispatch from notification engine

---

## T01: Implement Web Push Subscription Storage and Lifecycle

### Objective

Capture, update, and revoke browser push subscriptions per authenticated user and device.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — canonical channel model and delivery policy
- `tasks/phase-35-notification-infrastructure/README.md` — function coverage and integration contracts
- `notes/10-convex-schema.md` — schema/index conventions for new tables
- `notes/11-convex-architecture.md` — auth helpers and mutation/query patterns

### Key Rules

1. Store one active push subscription per `(user_id, endpoint)` identity.
2. Never hard-delete subscription records; deactivate stale or revoked entries via `is_active` flag.
3. Push channel eligibility is runtime-checked; missing active subscription is non-fatal and should not count as provider failure.
4. Subscription updates require authenticated user context and must be user-scoped.

### Deliverables

- [ ] `convex/schema.ts` — add `push_subscriptions` table with active flag and audit-friendly timestamps
- [ ] `convex/pushSubscriptions.ts` — subscribe/unsubscribe/list mutations and queries
- [ ] `convex/notifications.ts` — push recipient resolution helper using active subscription records

### Acceptance Criteria

1. Subscription save validates endpoint + keys payload and associates with authenticated user.
2. New subscription for same device supersedes stale endpoint records.
3. Unsubscribe mutation marks subscription as `is_active: false`.
4. Listing active subscriptions for a user excludes inactive rows by default.
5. Notification engine can detect "no active push subscription" and skip push dispatch cleanly.

### Verification

```bash
npx convex codegen
npx tsc --noEmit
npm run build
```

## T02: Integrate Serwist Service Worker Push Handlers

### Objective

Handle push receipt, click actions, and deep-link routing in service worker.

### Required Reading

- `notes/01-tech-stack.md` — PWA architecture and Serwist build constraints
- `notes/features/27-notification-infrastructure.md` — push channel behavior and in-app relationship
- `tasks/phase-35-notification-infrastructure/README.md` — scope boundaries for P35

### Key Rules

1. Service worker code must stay isolated in `src/app/sw.ts`; app runtime types must remain collision-free.
2. Push click handling must deep-link to safe in-app routes with fallback behavior.
3. Permission-denied/default browser states must degrade without errors or blocking app usage.
4. Do not implement provider dispatch logic in service worker; only presentation/interaction behavior belongs here.

### Deliverables

- [ ] `src/app/sw.ts` push event handling updates
- [ ] `src/lib/push-client.ts` — client helper for registration, permission checks, and subscription serialization
- [ ] `src/components/shared/push-permission-prompt.tsx` — reusable permission UX component for supported personas

### Acceptance Criteria

1. Service worker renders push notification with title/body/icon/action metadata.
2. Notification click focuses existing tab when available or opens target route.
3. Permission prompt respects browser state (`granted`, `denied`, `default`) and avoids repeated spam prompts.
4. Register/unregister logic handles unsupported browsers without throwing runtime errors.
5. Production build compiles service worker successfully with webpack pipeline.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T03: Wire Push Dispatch from Notification Engine

### Objective

Connect queued push deliveries to Web Push send pipeline with provider-safe error handling.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — retry policy, template resolution, admin dead-letter expectations
- `tasks/phase-35-notification-infrastructure/README.md` — `actions.notifications.sendPush` contract
- `notes/11-convex-architecture.md` — action invocation and internal function boundaries

### Key Rules

1. Provider calls must run in Convex Actions only (`actions.notifications.sendPush`).
2. Delivery status updates must be persisted per attempt (`DELIVERED`, retryable `FAILED`, terminal dead-letter).
3. Invalid/expired endpoints must deactivate subscription records to prevent repeated failures.
4. Push dispatch respects quiet-hours and dedup policy from the core engine.

### Deliverables

- [ ] `convex/actions/notifications.ts` — `sendPush` action using FCM provider credentials
- [ ] `convex/notifications.ts` — queue processor integration for push dispatch result handling
- [ ] `convex/notifications.ts` — retry classification for transient vs permanent push errors

### Acceptance Criteria

1. Successful push send marks channel delivery `DELIVERED` with timestamp and provider message id.
2. Retryable provider errors increment retry count and schedule next attempt.
3. Permanent errors (invalid token/endpoint) mark subscription inactive and stop retries for that endpoint.
4. Missing template or payload-variable mismatch fails fast with explicit error metadata.
5. Admin dead-letter query surfaces final push errors after max retries are exhausted.

### Verification

```bash
npx tsc --noEmit
npm run build
```
