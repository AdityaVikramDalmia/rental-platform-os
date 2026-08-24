---
id: P35-E03
title: WhatsApp & SMS Channels
phase: 35
status: pending
depends_on: ["P35-E01"]
skills: ["rental-platform-os-arch", "rental-platform-os-rules", "convex-api"]
updated_at: 2026-02-19
---

# P35-E03: WhatsApp & SMS Channels

## Task Queue

- [ ] P35-E03-T01: Add WhatsApp template mapping and partner action client
- [ ] P35-E03-T02: Add SMS provider action client and template fallback
- [ ] P35-E03-T03: Implement channel routing and failover policy
- [ ] P35-E03-T04: Add delivery receipts and retry/error normalization

---

## T01: Add WhatsApp Template Mapping and Partner Action Client

### Objective

Integrate WhatsApp Business delivery via configured partner API using approved templates.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — canonical channel model and retry policy
- `tasks/phase-35-notification-infrastructure/README.md` — function ownership (`actions.notifications.sendWhatsApp`)
- `notes/11-convex-architecture.md` — action boundaries and secrets handling
- `notes/13-constants-reference.md` — channel/status enum conventions

### Key Rules

1. WhatsApp delivery must run only through Convex Action adapter using environment credentials.
2. Use normalized 10-digit phone storage and provider-specific format conversion only at send boundary.
3. Template resolution must use `(event_type, channel, locale)` and validate required variables before API call.
4. Persist provider message identifiers for reconciliation and support debugging.

### Deliverables

- [ ] `convex/actions/notifications.ts` — `sendWhatsApp` action with provider auth, payload build, and response normalization
- [ ] `convex/notifications.ts` — WhatsApp dispatch adapter wiring from queue processor
- [ ] `convex/notificationTemplates.ts` — WhatsApp template lookup helpers and variable validation

### Acceptance Criteria

1. Action rejects missing WhatsApp credentials with explicit configuration error.
2. Outbound payload includes resolved template id/name, locale, and ordered variable map.
3. Phone number conversion is deterministic and provider compliant.
4. Successful send stores provider message id and marks delivery `DELIVERED`.
5. Provider failures classify retryable vs permanent and return normalized error codes.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T02: Add SMS Provider Action Client and Template Fallback

### Objective

Implement SMS delivery channel through Twilio/MSG91 adapter with fallback text templates.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — SMS retry policy and dead-letter behavior
- `tasks/phase-35-notification-infrastructure/README.md` — function ownership (`actions.notifications.sendSMS`)
- `notes/11-convex-architecture.md` — action adapter patterns

### Key Rules

1. SMS channel uses pluggable provider adapter pattern (Twilio/MSG91) behind one action contract.
2. SMS templates must be plain-text safe and avoid channel-specific markup.
3. SMS retries follow linear backoff policy (5s, 15s) and stop at configured max attempts.
4. Provider-specific errors must map to shared normalized error classes.

### Deliverables

- [ ] `convex/actions/notifications.ts` — `sendSMS` action with provider adapter abstraction
- [ ] `convex/notificationTemplates.ts` — SMS fallback template rendering path
- [ ] `convex/notifications.ts` — SMS dispatch integration with retry scheduling

### Acceptance Criteria

1. SMS action can send through at least one configured provider using unified input shape.
2. Template rendering works when WhatsApp template is unavailable but SMS template exists.
3. Retries use linear intervals and stop after max attempts.
4. Permanent failures are routed to dead-letter with final error details.
5. Provider message ids are persisted for delivery traceability.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T03: Implement Channel Routing and Failover Policy

### Objective

Route notifications across WhatsApp/SMS based on user preference, template availability, and delivery urgency.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — delivery policy algorithm and business rules
- `tasks/phase-35-notification-infrastructure/README.md` — category ownership and cross-phase contract
- `notes/04-state-machines.md` — transition validation discipline

### Key Rules

1. Routing must evaluate preferences, quiet-hours, and severity before choosing channel.
2. Failover is allowed only when next channel is enabled and template exists.
3. IN_APP creation remains mandatory and independent of external channel routing outcomes.
4. Routing decisions must be deterministic and idempotent per dedup key.

### Deliverables

- [ ] `convex/notifications.ts` — channel routing utility for WhatsApp/SMS/Email selection and failover
- [ ] `convex/notifications.ts` — urgency + quiet-hours gate integration for immediate vs deferred dispatch
- [ ] `lib/constants.ts` — default priority chain constants by persona/category

### Acceptance Criteria

1. Preferred channel is selected when enabled, configured, and template is available.
2. Quiet-hours defer non-urgent external sends and schedule retry at quiet-hours end.
3. Urgent events bypass quiet-hours and dispatch immediately.
4. After retry exhaustion on primary channel, eligible secondary channel is enqueued.
5. Routing output is reproducible for same event payload and preference snapshot.

### Verification

```bash
npx tsc --noEmit
npm run build
```

## T04: Add Delivery Receipts and Retry/Error Normalization

### Objective

Normalize provider responses/webhooks into consistent delivery status events.

### Required Reading

- `notes/features/27-notification-infrastructure.md` — admin dead-letter query contract
- `tasks/phase-35-notification-infrastructure/README.md` — E03 includes WhatsApp/SMS/Email action coverage
- `notes/11-convex-architecture.md` — HTTP/action event ingestion patterns

### Key Rules

1. All channel adapters (WhatsApp, SMS, Email) must normalize response and receipt statuses to shared enums.
2. Receipt ingestion must be idempotent and keyed by provider message id.
3. Retryability classification must be explicit and consistent across channels.
4. Dead-letter writes must include payload snapshot and final normalized error.

### Deliverables

- [ ] `convex/actions/notifications.ts` — `sendEmail` action adapter plus shared channel response normalizer
- [ ] `convex/http.ts` — webhook/receipt ingestion route(s) for provider delivery callbacks
- [ ] `convex/notifications.ts` — normalized delivery status update + dead-letter write path
- [ ] `lib/constants.ts` — normalized error code map and retryability classification keys

### Acceptance Criteria

1. Delivery receipts from WhatsApp/SMS/Email map to shared notification status values.
2. Duplicate receipt callbacks do not create duplicate state transitions.
3. Retryable and permanent failures are consistently classified across providers.
4. Dead-letter entries include final normalized error and provider context.
5. Admin dead-letter query can filter by channel and inspect payload snapshot.

### Verification

```bash
npx tsc --noEmit
npm run build
```
