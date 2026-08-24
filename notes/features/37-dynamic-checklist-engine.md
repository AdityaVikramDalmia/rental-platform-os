# Feature: Dynamic Checklist Engine

> **Priority**: #46 in implementation order (P46 — new standalone cross-cutting infrastructure phase)
> **Personas**: Guard (execution), OPS (field execution + review), Admin (template management + review), Tenant (read-only views), Owner (read-only views)
> **Dependencies**: P01 (Auth), P06 (Visit Management), P08 (Closure), P19 (Tenant Inquiry), P25 (Deal Room), P26 (Rent Negotiation), P30 (Field Ops), P34 (Transaction Rails), P45 (Multi-Persona Identity)
> **Route Groups**: `(guard)/`, `(ops)/`, `(admin)/`, `(tenant)/`, `(public)/`

---

## Purpose

Five separate checklist subsystems have accumulated across the platform: field inspection checklists (P30), deal room checklists (P25), negotiation post-agreement checklists (P26), transaction handover checklists (P34), and the tenant rental checklist (P18). Each was built independently to solve an immediate problem. Each defines "done," "mandatory," and "authorized" differently. Each has its own state machine, its own scoring semantics, its own permission checks, and its own enforcement gaps.

The result is policy fragmentation. A change to what "mandatory" means in the context of a visit closure requires edits in at least three modules. An ACL bug in one engine does not get caught by tests in another. When P45 (Multi-Persona Identity) ships, authorization checks that use `user_type ===` instead of `user_types.includes()` will silently fail for multi-persona users. The five engines will drift further apart with every new phase.

The Dynamic Checklist Engine unifies the core runtime without collapsing every domain workflow into one giant module. The strategy is a shared infrastructure layer with thin domain adapters. All checklist definitions, instances, responses, approvals, and events flow through one set of tables and one set of Convex functions. Domain-specific behavior (field inspection scoring, deal room dual sign-off, negotiation closure gating) is expressed as configuration on the definition, not as separate code paths. This makes policy changes single-site edits, makes ACL enforcement consistent, and makes audit trails coherent across the entire platform.

V1 of this phase migrates Field Checklists (P30), Negotiation Checklists (P26), and Handover Checklists (P34) into the unified engine. It adds two new checklist types that currently have no implementation: Lead Verification and Pre-Visit Readiness. Deal Room Checklists (P25) are deferred to V2 because they require deep integration with the AI term extraction pipeline and dual-party cryptographic sign-off, which carry migration risk disproportionate to V1 scope. The tenant rental checklist (P18) is also V2 because it is localStorage-only and has no backend persistence to migrate.

---

## V1 Scope

### Included in V1

- Unified schema: `checklist_definitions`, `checklist_versions`, `checklist_instances`, `checklist_responses`, `checklist_approvals`, `checklist_events`
- Expression engine for conditional visibility and conditional required rules (server-side evaluated)
- Template versioning with immutable snapshots: in-flight instances continue on their pinned version
- Pluggable scoring: weighted completeness, penalty-based, category-weighted
- Approval gates with escalation crons
- Optimistic concurrency via `version` field on instances (CAS token pattern)
- Feature flags per workflow type for staged migration
- Migration of Field Checklists (P30) to unified engine
- Migration of Negotiation Checklists (P26) to unified engine
- Migration of Handover Checklists (P34) to unified engine
- New: Lead Verification checklist (gates SUBMITTED to VERIFIED transition)
- New: Pre-Visit Readiness checklist (guard confirms readiness before arriving at property)
- Admin template management UI at `/admin/checklists/definitions`
- Guard execution UI at `/guard/checklists/[instanceId]`
- OPS execution and review UI at `/ops/checklists/[instanceId]`
- Admin review queue at `/admin/checklists/review`
- Read-only tenant and owner views via scoped queries

### V2 Deferred

- Deal Room Checklist migration (P25): AI term extraction integration, dual-party cryptographic sign-off, owner invite flow coupling
- Tenant rental checklist (P18): backend persistence, sync from localStorage
- No-code admin DSL editor (YAML/JSON template authoring in the UI)
- AI evidence validation (photo quality scoring, auto-flagging incomplete photo evidence)
- Guard Onboarding checklist type
- Society Onboarding checklist type
- Owner Onboarding checklist type
- Compliance/Regulatory recurring checklist type
- Recurring Inspection scheduling engine
- Cross-instance dependency chains (checklist B cannot start until checklist A is approved)

---

## Entities Involved

### New Tables (Unified Engine)

- `checklist_definitions` — reusable template definitions with sections, items, scoring config, and gate config
- `checklist_versions` — immutable snapshots of a definition at a point in time; instances pin to a version
- `checklist_instances` — one instance per subject (visit, lead, negotiation, transaction); tracks lifecycle status
- `checklist_responses` — one record per item response; replaces previous response for the same item
- `checklist_approvals` — approval/rejection records from reviewers; supports multi-party approval
- `checklist_events` — append-only audit log of all state transitions and significant actions

### Existing Tables Consumed (Read/Write)

- `visits` — field inspection and pre-visit readiness instances link here
- `leads` — lead verification instances link here
- `negotiations` — negotiation checklist instances link here; closure gate reads instance status
- `rental_transactions` — handover checklist instances link here; completion gate reads instance status
- `users` — actor identity for all operations
- `guard_profiles` — quality score recomputation on field checklist approval
- `quality_score_history` — updated when field checklist instance is approved
- `system_config` — feature flags and escalation thresholds

### Existing Tables Deprecated (V1 Migration)

- `checklist_templates` (P30) — migrated to `checklist_definitions` + `checklist_versions`; kept read-only during migration window
- `checklist_instances` (P30, old table) — renamed to `legacy_checklist_instances` during migration; new table takes the name
- `handover_checklists` (P34) — migrated to `checklist_instances` with type `HANDOVER`; kept read-only during migration window

---

## Checklist Types

| Type                  | Constant                             | Subject          | Who Executes | Gate                                  |
| --------------------- | ------------------------------------ | ---------------- | ------------ | ------------------------------------- |
| `FIELD_INSPECTION`    | `CHECKLIST_TYPE.FIELD_INSPECTION`    | `visit_id`       | Guard / OPS  | Visit quality score (30%)             |
| `PRE_VISIT_READINESS` | `CHECKLIST_TYPE.PRE_VISIT_READINESS` | `visit_id`       | Guard        | Visit start (soft gate in V1)         |
| `LEAD_VERIFICATION`   | `CHECKLIST_TYPE.LEAD_VERIFICATION`   | `lead_id`        | Admin / OPS  | Lead SUBMITTED to VERIFIED transition |
| `NEGOTIATION_DOCS`    | `CHECKLIST_TYPE.NEGOTIATION_DOCS`    | `negotiation_id` | OPS          | Negotiation READY_FOR_CLOSURE gate    |
| `HANDOVER`            | `CHECKLIST_TYPE.HANDOVER`            | `transaction_id` | OPS / Guard  | Transaction COMPLETED gate            |
| `MOVE_IN_HANDOVER`    | `CHECKLIST_TYPE.MOVE_IN_HANDOVER`    | `visit_id`       | Guard / OPS  | Formal move-in record                 |

---

## Item Types

The unified engine supports all item types from the P30 field checklist engine plus two new types:

| Type              | Constant                              | Input                                       | Validation                                       |
| ----------------- | ------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| `CONDITION`       | `CHECKLIST_ITEM_TYPE.CONDITION`       | Rating: EXCELLENT / GOOD / FAIR / POOR / NA | `condition_rating` required                      |
| `CHECKBOX`        | `CHECKLIST_ITEM_TYPE.CHECKBOX`        | Toggle yes/no                               | `value` must be `"true"` or `"false"`            |
| `TEXT`            | `CHECKLIST_ITEM_TYPE.TEXT`            | Free text                                   | `value` non-empty string                         |
| `NUMBER`          | `CHECKLIST_ITEM_TYPE.NUMBER`          | Numeric entry                               | `value` parses as finite number                  |
| `PHOTO`           | `CHECKLIST_ITEM_TYPE.PHOTO`           | Upload 1+ photos                            | `photo_ids.length > 0`                           |
| `PHOTO_CONDITION` | `CHECKLIST_ITEM_TYPE.PHOTO_CONDITION` | Photo + condition rating                    | Both `photo_ids` and `condition_rating` required |
| `DOCUMENT`        | `CHECKLIST_ITEM_TYPE.DOCUMENT`        | File upload (PDF/image)                     | `document_storage_id` required                   |
| `ENUM_SELECT`     | `CHECKLIST_ITEM_TYPE.ENUM_SELECT`     | Select from defined options                 | `value` must be one of `allowed_values`          |

---

## Expression Engine

The expression engine evaluates conditional rules server-side inside Convex mutations. It is never evaluated client-only. The client may mirror evaluation for UX responsiveness, but the server is authoritative.

### Syntax

Expressions are stored as strings on item definitions. The engine parses and evaluates them at response-save time and at submission-validation time.

```
# Field reference
{section_id.item_id}

# Comparison operators
{section_id.item_id} = 'value'
{section_id.item_id} != 'value'
{section_id.item_id} >= 5
{section_id.item_id} <= 10
{section_id.item_id} > 0
{section_id.item_id} < 100

# Existence checks
{section_id.item_id} empty
{section_id.item_id} notempty

# String functions
contains({section_id.item_id}, 'substring')
startsWith({section_id.item_id}, 'prefix')

# Boolean combinators
{a.b} = 'POOR' and {c.d} notempty
{a.b} = 'EXCELLENT' or {a.b} = 'GOOD'
not ({a.b} = 'NA')

# Context variables (injected at evaluation time)
{context.checklist_type} = 'FIELD_INSPECTION'
{context.depth} = 'FULL'
{context.subject_type} = 'visit'
```

### Rule Types on Items

| Rule                   | Field               | Effect                                                                         |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------ |
| Conditional visibility | `visible_if`        | Item is hidden (and skipped in validation) when expression is false            |
| Conditional required   | `required_if`       | Item becomes required when expression is true (overrides `is_required: false`) |
| Conditional photo      | `photo_required_if` | Photo evidence becomes mandatory when expression is true                       |

### Evaluation Order

1. Evaluate `visible_if` for all items using current response state
2. For visible items, evaluate `required_if` to determine effective required set
3. For visible required items, evaluate `photo_required_if`
4. Validate responses against effective required set

### Implementation Notes

The expression parser lives in `lib/checklist-expression-engine.ts` (shared between `convex/` and `src/`). It is a recursive descent parser with no external dependencies. It returns a typed AST that the evaluator walks. The evaluator receives a `ResponseMap` (keyed by `section_id.item_id`) and a `ContextMap` (injected from the instance's subject). Both maps are plain objects with string values.

---

## Scoring Algorithms

Each definition specifies a `scoring_config` that determines how `completeness_score` is computed.

### Algorithm: `WEIGHTED_COMPLETENESS`

Default for field inspection checklists. Weighted average of required item completion rates per section.

```typescript
// Each section has a weight (0-100, must sum to 100 across sections)
// Score = sum(section_weight * section_completion_rate) / 100
// section_completion_rate = completed_required_items / total_required_items_in_section
// Mandatory items: if any mandatory item is incomplete, score is capped at 0 regardless of weighted average
```

### Algorithm: `PENALTY_BASED`

Starts at 100, deducts per failure. Used for compliance-style checklists.

```typescript
// Score = 100 - sum(penalty_per_failed_item)
// Each item has a penalty_weight (default 10)
// Score floor is 0
// Mandatory items: if any mandatory item is incomplete, score is 0
```

### Algorithm: `BINARY`

Used for simple gate checklists (negotiation docs, handover). Score is 100 if all required items are complete, 0 otherwise.

```typescript
// Score = all_required_complete ? 100 : 0
```

---

## Status Model

### Instance Status

```
ASSIGNED -> IN_PROGRESS -> SUBMITTED -> UNDER_REVIEW -> APPROVED
                                                      -> REJECTED
                                                      -> REVISION_REQUESTED -> IN_PROGRESS
```

```typescript
const VALID_INSTANCE_TRANSITIONS: Record<ChecklistInstanceStatus, ChecklistInstanceStatus[]> = {
  ASSIGNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "REVISION_REQUESTED"],
  REVISION_REQUESTED: ["IN_PROGRESS", "CANCELLED"],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};
```

Terminal states: `APPROVED`, `REJECTED`, `CANCELLED`.

### Approval Status (per `checklist_approvals` record)

```typescript
const APPROVAL_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  REVISION_REQUESTED: "REVISION_REQUESTED",
} as const;
```

### Gate Evaluation

Each definition has a `gate_config` that specifies what downstream action is gated and what condition must be met.

```typescript
type GateConfig = {
  gates_action:
    | "LEAD_VERIFY"
    | "VISIT_COMPLETE"
    | "NEGOTIATION_CLOSE"
    | "TRANSACTION_COMPLETE"
    | "NONE";
  gate_condition: "APPROVED" | "SUBMITTED" | "SCORE_GTE";
  score_threshold?: number; // used when gate_condition is SCORE_GTE
  is_mandatory: boolean; // if false, gate is advisory only (warning, not block)
};
```

---

## Schema (Proposed)

### `checklist_definitions` Table

| Field               | Type                                                                                                                                                                                            | Required | Description                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------- |
| `name`              | `v.string()`                                                                                                                                                                                    | yes      | Human-readable name                                      |
| `description`       | `v.optional(v.string())`                                                                                                                                                                        | no       | Admin-facing description                                 |
| `checklist_type`    | `v.union(v.literal("FIELD_INSPECTION"), v.literal("PRE_VISIT_READINESS"), v.literal("LEAD_VERIFICATION"), v.literal("NEGOTIATION_DOCS"), v.literal("HANDOVER"), v.literal("MOVE_IN_HANDOVER"))` | yes      | Domain type                                              |
| `depth`             | `v.optional(v.union(v.literal("LIGHT"), v.literal("MEDIUM"), v.literal("FULL")))`                                                                                                               | no       | Depth tier (field inspection only)                       |
| `scoring_algorithm` | `v.union(v.literal("WEIGHTED_COMPLETENESS"), v.literal("PENALTY_BASED"), v.literal("BINARY"))`                                                                                                  | yes      | Scoring strategy                                         |
| `gate_config`       | `v.object({ gates_action: v.string(), gate_condition: v.string(), score_threshold: v.optional(v.number()), is_mandatory: v.boolean() })`                                                        | yes      | Downstream gate configuration                            |
| `active_version_id` | `v.optional(v.id("checklist_versions"))`                                                                                                                                                        | no       | Currently active version (null if no published version)  |
| `is_active`         | `v.boolean()`                                                                                                                                                                                   | yes      | Only active definitions can be assigned to new instances |
| `is_deleted`        | `v.boolean()`                                                                                                                                                                                   | yes      | Soft delete                                              |
| `created_by`        | `v.id("users")`                                                                                                                                                                                 | yes      | Admin who created the definition                         |
| `created_at`        | `v.number()`                                                                                                                                                                                    | yes      | Unix ms                                                  |
| `updated_at`        | `v.number()`                                                                                                                                                                                    | yes      | Unix ms                                                  |

**Indexes**: `by_checklist_type`, `by_is_active`, `by_created_by`

---

### `checklist_versions` Table

Immutable snapshots. Once created, a version record is never mutated. In-flight instances pin to a version ID and continue using that version's sections and items even if the definition is updated.

| Field               | Type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Required | Description                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------- |
| `definition_id`     | `v.id("checklist_definitions")`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | yes      | Parent definition                             |
| `version_number`    | `v.number()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | yes      | Incrementing integer (1, 2, 3, ...)           |
| `sections`          | `v.array(v.object({ section_id: v.string(), title: v.string(), description: v.optional(v.string()), weight: v.optional(v.number()), items: v.array(v.object({ item_id: v.string(), label: v.string(), item_type: v.string(), is_required: v.boolean(), requires_photo: v.boolean(), min_depth: v.optional(v.string()), allowed_values: v.optional(v.array(v.string())), penalty_weight: v.optional(v.number()), visible_if: v.optional(v.string()), required_if: v.optional(v.string()), photo_required_if: v.optional(v.string()), context_label_template: v.optional(v.string()) })) }))` | yes      | Full section and item snapshot                |
| `scoring_algorithm` | `v.string()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | yes      | Snapshot of scoring algorithm at publish time |
| `gate_config`       | `v.object({ gates_action: v.string(), gate_condition: v.string(), score_threshold: v.optional(v.number()), is_mandatory: v.boolean() })`                                                                                                                                                                                                                                                                                                                                                                                                                                                    | yes      | Snapshot of gate config at publish time       |
| `published_by`      | `v.id("users")`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | yes      | Admin who published this version              |
| `published_at`      | `v.number()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | yes      | Unix ms                                       |
| `change_summary`    | `v.optional(v.string())`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | no       | Human-readable description of what changed    |

**Indexes**: `by_definition_id`, `by_definition_and_version` (compound: definition_id + version_number)

---

### `checklist_instances` Table

| Field                | Type                                                                                                                                                                                                                 | Required | Description                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| `definition_id`      | `v.id("checklist_definitions")`                                                                                                                                                                                      | yes      | Parent definition                                              |
| `version_id`         | `v.id("checklist_versions")`                                                                                                                                                                                         | yes      | Pinned version snapshot                                        |
| `checklist_type`     | `v.string()`                                                                                                                                                                                                         | yes      | Denormalized from definition for query efficiency              |
| `subject_type`       | `v.union(v.literal("visit"), v.literal("lead"), v.literal("negotiation"), v.literal("transaction"))`                                                                                                                 | yes      | What this instance is attached to                              |
| `subject_id`         | `v.string()`                                                                                                                                                                                                         | yes      | ID of the subject record (visit_id, lead_id, etc.)             |
| `assigned_to`        | `v.id("users")`                                                                                                                                                                                                      | yes      | User responsible for completing this instance                  |
| `assigned_by`        | `v.id("users")`                                                                                                                                                                                                      | yes      | Admin/OPS who created the assignment                           |
| `status`             | `v.union(v.literal("ASSIGNED"), v.literal("IN_PROGRESS"), v.literal("SUBMITTED"), v.literal("UNDER_REVIEW"), v.literal("APPROVED"), v.literal("REJECTED"), v.literal("REVISION_REQUESTED"), v.literal("CANCELLED"))` | yes      | Instance lifecycle status                                      |
| `depth`              | `v.optional(v.union(v.literal("LIGHT"), v.literal("MEDIUM"), v.literal("FULL")))`                                                                                                                                    | no       | Depth tier for field inspection instances                      |
| `completeness_score` | `v.optional(v.number())`                                                                                                                                                                                             | no       | 0-100, computed on submit and on approval                      |
| `instance_version`   | `v.number()`                                                                                                                                                                                                         | yes      | Optimistic concurrency token; incremented on every mutation    |
| `started_at`         | `v.optional(v.number())`                                                                                                                                                                                             | no       | Unix ms                                                        |
| `submitted_at`       | `v.optional(v.number())`                                                                                                                                                                                             | no       | Unix ms                                                        |
| `approved_at`        | `v.optional(v.number())`                                                                                                                                                                                             | no       | Unix ms                                                        |
| `rejected_at`        | `v.optional(v.number())`                                                                                                                                                                                             | no       | Unix ms                                                        |
| `cancelled_at`       | `v.optional(v.number())`                                                                                                                                                                                             | no       | Unix ms                                                        |
| `escalated_at`       | `v.optional(v.number())`                                                                                                                                                                                             | no       | Unix ms; set by escalation cron                                |
| `escalation_level`   | `v.optional(v.number())`                                                                                                                                                                                             | no       | 0 = not escalated, 1 = warned, 2 = reassigned, 3 = auto-failed |
| `is_deleted`         | `v.boolean()`                                                                                                                                                                                                        | yes      | Soft delete                                                    |
| `created_at`         | `v.number()`                                                                                                                                                                                                         | yes      | Unix ms                                                        |
| `updated_at`         | `v.number()`                                                                                                                                                                                                         | yes      | Unix ms                                                        |

**Indexes**: `by_subject` (compound: subject_type + subject_id), `by_assigned_to`, `by_status`, `by_checklist_type`, `by_definition_id`, `by_escalated_at`, `by_created_at`

---

### `checklist_responses` Table

One record per item response. Upserted on every `updateResponse` call: the latest response for a given `(instance_id, section_id, item_id)` triple replaces the previous one.

| Field                 | Type                                                                                                                                              | Required | Description                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| `instance_id`         | `v.id("checklist_instances")`                                                                                                                     | yes      | Parent instance                                             |
| `section_id`          | `v.string()`                                                                                                                                      | yes      | Section UUID from version snapshot                          |
| `item_id`             | `v.string()`                                                                                                                                      | yes      | Item UUID from version snapshot                             |
| `value`               | `v.optional(v.string())`                                                                                                                          | no       | Text, number (as string), checkbox value, or enum selection |
| `condition_rating`    | `v.optional(v.union(v.literal("EXCELLENT"), v.literal("GOOD"), v.literal("FAIR"), v.literal("POOR"), v.literal("NA")))`                           | no       | For CONDITION and PHOTO_CONDITION items                     |
| `photo_ids`           | `v.optional(v.array(v.id("_storage")))`                                                                                                           | no       | For PHOTO and PHOTO_CONDITION items                         |
| `photo_metadata`      | `v.optional(v.array(v.object({ storage_id: v.id("_storage"), taken_at: v.number(), lat: v.optional(v.number()), lng: v.optional(v.number()) })))` | no       | GPS-tagged photo metadata                                   |
| `document_storage_id` | `v.optional(v.id("_storage"))`                                                                                                                    | no       | For DOCUMENT items                                          |
| `notes`               | `v.optional(v.string())`                                                                                                                          | no       | Guard/OPS notes on this item                                |
| `responded_by`        | `v.id("users")`                                                                                                                                   | yes      | Who saved this response                                     |
| `responded_at`        | `v.number()`                                                                                                                                      | yes      | Unix ms                                                     |

**Indexes**: `by_instance_id`, `by_instance_and_item` (compound: instance_id + section_id + item_id)

---

### `checklist_approvals` Table

| Field             | Type                                                                                     | Required | Description                          |
| ----------------- | ---------------------------------------------------------------------------------------- | -------- | ------------------------------------ |
| `instance_id`     | `v.id("checklist_instances")`                                                            | yes      | Parent instance                      |
| `reviewer_id`     | `v.id("users")`                                                                          | yes      | Admin/OPS who reviewed               |
| `outcome`         | `v.union(v.literal("APPROVED"), v.literal("REJECTED"), v.literal("REVISION_REQUESTED"))` | yes      | Review outcome                       |
| `review_notes`    | `v.string()`                                                                             | yes      | Required for all outcomes            |
| `reviewed_at`     | `v.number()`                                                                             | yes      | Unix ms                              |
| `score_at_review` | `v.optional(v.number())`                                                                 | no       | Completeness score at time of review |

**Indexes**: `by_instance_id`, `by_reviewer_id`, `by_reviewed_at`

---

### `checklist_events` Table

Append-only audit log. Never mutated after insert.

| Field         | Type                                                                                     | Required | Description                                            |
| ------------- | ---------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------ |
| `instance_id` | `v.id("checklist_instances")`                                                            | yes      | Parent instance                                        |
| `event_type`  | `v.string()`                                                                             | yes      | See event type constants below                         |
| `actor_id`    | `v.optional(v.id("users"))`                                                              | no       | Null for system-generated events                       |
| `actor_type`  | `v.union(v.literal("GUARD"), v.literal("OPS"), v.literal("ADMIN"), v.literal("SYSTEM"))` | yes      | Actor category                                         |
| `from_status` | `v.optional(v.string())`                                                                 | no       | Previous instance status                               |
| `to_status`   | `v.optional(v.string())`                                                                 | no       | New instance status                                    |
| `metadata`    | `v.optional(v.object({}))`                                                               | no       | Event-specific payload (e.g., escalation level, score) |
| `occurred_at` | `v.number()`                                                                             | yes      | Unix ms                                                |

**Event Types**: `ASSIGNED`, `STARTED`, `RESPONSE_SAVED`, `SUBMITTED`, `REVIEW_STARTED`, `APPROVED`, `REJECTED`, `REVISION_REQUESTED`, `REOPENED`, `CANCELLED`, `ESCALATED`, `GATE_EVALUATED`, `GATE_PASSED`, `GATE_BLOCKED`

**Indexes**: `by_instance_id`, `by_occurred_at`, `by_event_type`

---

## Convex Functions

### Queries

```typescript
checklistDefinitions.list({ checklist_type?, is_active?, cursor? })
// Admin: list all definitions with optional filters
// Requires: checklists.view permission

checklistDefinitions.getById({ definition_id })
// Returns definition with active version details
// Requires: checklists.view permission

checklistVersions.listByDefinition({ definition_id })
// Returns all versions for a definition, newest first
// Requires: checklists.view permission

checklistInstances.getBySubject({ subject_type, subject_id })
// Returns all instances for a subject (visit, lead, negotiation, transaction)
// Guard: only their own; Admin/OPS: all

checklistInstances.getById({ instance_id })
// Returns instance with version snapshot, responses, and latest approval
// Guard: only their own; Admin/OPS: all

checklistInstances.listForReview({ checklist_type?, status?, cursor? })
// Admin/OPS review queue
// Requires: checklists.review permission

checklistInstances.listForGuard({ cursor? })
// Guard's own assigned instances across all types
// Requires: authenticated guard

checklistInstances.getGateStatus({ subject_type, subject_id, gates_action })
// Returns whether the gate for a given action is satisfied
// Used by lead verify, visit complete, negotiation close, transaction complete mutations
// Returns: { is_satisfied: boolean, blocking_instances: string[], advisory_instances: string[] }

checklistResponses.listByInstance({ instance_id })
// Returns all current responses for an instance (latest per item)
// Same access rules as getById

checklistEvents.listByInstance({ instance_id, cursor? })
// Append-only event log for an instance
// Requires: checklists.view permission
```

### Mutations

```typescript
checklistDefinitions.create({ name, description?, checklist_type, depth?, scoring_algorithm, gate_config })
// Admin creates a new definition (no sections yet; add via publishVersion)
// Requires: checklists.manage permission

checklistVersions.publish({ definition_id, sections, change_summary? })
// Admin publishes a new version with full section/item snapshot
// Validates: section weights sum to 100 for WEIGHTED_COMPLETENESS
// Validates: all item_ids and section_ids are stable UUIDs
// Sets definition.active_version_id to new version
// Requires: checklists.manage permission

checklistInstances.create({ definition_id, subject_type, subject_id, assigned_to, depth? })
// Admin/OPS creates an instance for a subject
// Validates: definition is active, subject exists, no existing non-cancelled instance for same subject+type
// Pins to definition.active_version_id
// Requires: checklists.assign permission

checklistInstances.createInternal({ definition_id, subject_type, subject_id, assigned_to, assigned_by, depth? })
// Internal mutation called by other mutations (e.g., auto-create on visit creation)

checklistInstances.start({ instance_id, expected_version })
// Guard/OPS starts working on their assigned instance
// Validates: caller is assigned_to, status is ASSIGNED, expected_version matches instance_version
// Status: ASSIGNED -> IN_PROGRESS
// Increments instance_version

checklistInstances.updateResponse({ instance_id, expected_version, section_id, item_id, value?, condition_rating?, photo_ids?, photo_metadata?, document_storage_id?, notes? })
// Guard/OPS saves a response for one item
// Validates: caller is assigned_to, status is IN_PROGRESS, expected_version matches
// Upserts checklist_responses record
// Re-evaluates expression engine for all items
// Recomputes completeness_score
// Increments instance_version

checklistInstances.submit({ instance_id, expected_version })
// Guard/OPS submits completed instance
// Validates: caller is assigned_to, status is IN_PROGRESS, expected_version matches
// Validates: all effective required items have valid responses (after expression evaluation)
// Validates: all photo requirements met
// Finalizes completeness_score
// Status: IN_PROGRESS -> SUBMITTED
// Increments instance_version

checklistInstances.review({ instance_id, outcome, review_notes })
// Admin/OPS reviews a submitted instance
// Validates: status is SUBMITTED or UNDER_REVIEW
// outcome: APPROVED | REJECTED | REVISION_REQUESTED
// On APPROVED: triggers downstream hooks (quality score recomputation for FIELD_INSPECTION)
// On REVISION_REQUESTED: status -> REVISION_REQUESTED
// Requires: checklists.review permission

checklistInstances.reopen({ instance_id })
// Guard/OPS reopens a REVISION_REQUESTED instance
// Validates: caller is assigned_to, status is REVISION_REQUESTED
// Status: REVISION_REQUESTED -> IN_PROGRESS

checklistInstances.cancel({ instance_id, reason })
// Admin/OPS cancels an instance
// Validates: status is not APPROVED, REJECTED, or CANCELLED
// Requires: checklists.manage permission

checklistInstances.evaluateGate({ subject_type, subject_id, gates_action })
// Internal mutation called by lead verify, visit complete, negotiation close, transaction complete
// Returns gate evaluation result; throws if mandatory gate is not satisfied
// Records GATE_EVALUATED event

checklistDefinitions.generateUploadUrl()
// Returns a Convex storage upload URL for photo and document uploads
// Requires: any authenticated user
```

---

## Gate Integration Contracts

These are the contracts that downstream mutations must call before executing their primary action. Each contract is enforced by calling `checklistInstances.evaluateGate()` as an internal mutation.

### Lead Verification Gate

```typescript
// In leads.verify() mutation, before status transition:
const gate = await ctx.runMutation(internal.checklistInstances.evaluateGate, {
  subject_type: "lead",
  subject_id: args.lead_id,
  gates_action: "LEAD_VERIFY",
});
// gate.is_satisfied must be true, or gate.is_mandatory must be false
// If mandatory and not satisfied: throw "Lead verification checklist must be completed before verifying this lead."
```

### Visit Completion Gate

```typescript
// In visits.complete() mutation, before status transition:
const gate = await ctx.runMutation(internal.checklistInstances.evaluateGate, {
  subject_type: "visit",
  subject_id: args.visit_id,
  gates_action: "VISIT_COMPLETE",
});
// Advisory in V1 for PRE_VISIT_READINESS; mandatory for FIELD_INSPECTION if attached
```

### Negotiation Closure Gate

```typescript
// In negotiations.updateChecklistItem() when checking readiness:
const gate = await ctx.runMutation(internal.checklistInstances.evaluateGate, {
  subject_type: "negotiation",
  subject_id: args.negotiation_id,
  gates_action: "NEGOTIATION_CLOSE",
});
// Mandatory: all NEGOTIATION_DOCS items must be in APPROVED or SUBMITTED state
```

### Transaction Completion Gate

```typescript
// In rentalTransactions.complete() mutation:
const gate = await ctx.runMutation(internal.checklistInstances.evaluateGate, {
  subject_type: "transaction",
  subject_id: args.transaction_id,
  gates_action: "TRANSACTION_COMPLETE",
});
// Mandatory: HANDOVER checklist must be APPROVED or SUBMITTED
```

### P44 / P45 Authorization Contract

All gate evaluations and instance mutations must use `requireFieldWorker(ctx)` (not `requireGuard(ctx)`) when the actor may be either a Guard or an OPS user. The `requireFieldWorker` helper checks `user_types.includes("GUARD") || user_types.includes("OPS")` to support multi-persona users from P45.

```typescript
// Correct for P44/P45 compatibility:
const actor = await requireFieldWorker(ctx);

// Wrong (breaks multi-persona users):
const guard = await requireGuard(ctx); // user_type === "GUARD" only
```

---

## Integration Contracts for Future Phases

### P38 (Owner Portal) and P43 (Tenant Portal)

Owner and tenant portals consume read-only checklist views via scoped queries. They cannot create, update, or review instances. The scoped queries filter by subject and return only the fields appropriate for each persona.

```typescript
// Tenant read-only view (P43):
checklistInstances.getForTenant({ subject_type, subject_id });
// Returns: status, completeness_score, submitted_at, approved_at
// Does NOT return: reviewer notes, internal metadata, other tenants' instances

// Owner read-only view (P38):
checklistInstances.getForOwner({ subject_type, subject_id });
// Returns: status, completeness_score, approved_at
// Does NOT return: guard identity, reviewer notes
```

### P44 (OPS Superset Expansion)

OPS users execute checklists using the same mutations as guards. The `requireFieldWorker` helper (described above) is the single authorization point. OPS users additionally have `checklists.review` permission, allowing them to review instances they did not execute.

### P45 (Multi-Persona Identity)

All permission checks in checklist mutations must use `user_types.includes()` pattern. The `assigned_to` field stores a `user_id`, not a `user_type`. Authorization checks whether the calling user's ID matches `assigned_to`, not whether their type matches an expected type.

---

## Migration Strategy

### Phase 1: Schema and Engine (Week 1-2)

Deploy new tables (`checklist_definitions`, `checklist_versions`, `checklist_instances`, `checklist_responses`, `checklist_approvals`, `checklist_events`) alongside existing tables. No existing code changes. Feature flag `checklist_engine_v2_enabled` defaults to `false`.

### Phase 2: Field Checklist Migration (Week 3-4)

1. Create `checklist_definitions` records for all existing `checklist_templates`
2. Publish `checklist_versions` snapshots from existing template data
3. Enable dual-write: new visit assignments write to both old `checklist_instances` (P30) and new `checklist_instances` (P46)
4. Enable read-compare: admin review queue reads from both; discrepancies are logged
5. Feature flag `checklist_field_v2` enables new engine for new assignments only
6. Run gate parity tests: verify that `VISIT_COMPLETE` gate produces identical results from both engines for the same visit

### Phase 3: Negotiation and Handover Migration (Week 5-6)

1. Create `checklist_definitions` for `NEGOTIATION_DOCS` and `HANDOVER` types
2. Backfill existing `negotiations` records: create `checklist_instances` for each negotiation with a post-agreement checklist
3. Backfill existing `handover_checklists` records: create `checklist_instances` for each transaction
4. Enable feature flags `checklist_negotiation_v2` and `checklist_handover_v2`
5. Run gate parity tests for `NEGOTIATION_CLOSE` and `TRANSACTION_COMPLETE` gates

### Phase 4: New Types (Week 7)

1. Create `checklist_definitions` for `LEAD_VERIFICATION` and `PRE_VISIT_READINESS`
2. Enable `LEAD_VERIFY` gate in `leads.verify()` (mandatory)
3. Enable `VISIT_COMPLETE` advisory gate for `PRE_VISIT_READINESS`

### Phase 5: Cutover and Deprecation (Week 8)

1. All feature flags set to `true`
2. Old `checklist_templates` and old `checklist_instances` (P30) marked `is_deleted: true`
3. Old `handover_checklists` (P34) marked `is_deleted: true`
4. Old Convex files (`convex/checklistTemplates.ts`, old `convex/checklists.ts`) moved to `convex/legacy/` and marked deprecated
5. Final cutover blocked until gate parity tests pass for all five workflow types

### Dual-Write Safety

During migration, dual-write mutations use a transaction-like pattern: write to new engine first, then write to old engine. If the old engine write fails, log the error but do not roll back the new engine write (new engine is authoritative). If the new engine write fails, throw and do not write to old engine.

---

## New Checklist Definitions (V1)

### Lead Verification Checklist

**Type**: `LEAD_VERIFICATION`
**Scoring**: `BINARY`
**Gate**: `LEAD_VERIFY`, mandatory

| Section          | Item                                            | Type        | Required |
| ---------------- | ----------------------------------------------- | ----------- | -------- |
| Owner Contact    | Owner phone verified (called and confirmed)     | CHECKBOX    | yes      |
| Owner Contact    | Owner confirmed flat is vacant                  | CHECKBOX    | yes      |
| Owner Contact    | Owner confirmed they are the owner (not tenant) | CHECKBOX    | yes      |
| Property Details | Flat number confirmed with owner                | TEXT        | yes      |
| Property Details | Flat size / BHK confirmed                       | ENUM_SELECT | yes      |
| Property Details | Asking rent confirmed (in rupees)               | NUMBER      | yes      |
| Documentation    | Guard has seen the flat or has reliable source  | CHECKBOX    | yes      |
| Documentation    | No active tenant dispute reported               | CHECKBOX    | yes      |
| Documentation    | Owner consent to list obtained                  | CHECKBOX    | yes      |

### Pre-Visit Readiness Checklist

**Type**: `PRE_VISIT_READINESS`
**Scoring**: `BINARY`
**Gate**: `VISIT_COMPLETE`, advisory in V1

| Section     | Item                                       | Type     | Required |
| ----------- | ------------------------------------------ | -------- | -------- |
| Logistics   | Guard has confirmed visit time with tenant | CHECKBOX | yes      |
| Logistics   | Guard has directions to the property       | CHECKBOX | yes      |
| Logistics   | Guard has key contact or access arranged   | CHECKBOX | yes      |
| Logistics   | Guard has tenant's phone number            | CHECKBOX | yes      |
| Preparation | Guard has reviewed listing details         | CHECKBOX | no       |
| Preparation | Guard has checklist app open and ready     | CHECKBOX | no       |

---

## User Stories

### Guard: Complete Pre-Visit Readiness

**As a guard**, I want to confirm I am ready before arriving at a property, so I do not waste the tenant's time with a failed visit.

**Acceptance Criteria**:

- Pre-visit readiness checklist appears on visit detail page when visit status is ASSIGNED or CONFIRMED
- Guard can complete the checklist before or after arriving
- Checklist is advisory in V1: guard can complete the visit without it, but a warning is shown
- Checklist completion is recorded and visible to admin

### Guard: Complete Field Inspection

**As a guard**, I want to work through a structured inspection checklist during a visit, so my observations are recorded consistently and feed my quality score.

**Acceptance Criteria**:

- Field inspection checklist assigned automatically when visit is created (if a FIELD_INSPECTION definition is active)
- Guard sees checklist badge on visit card showing current status
- Guard can start, fill items, and submit the checklist from the visit detail page
- Submission validates all required items; error message names the specific missing item
- Completeness score is shown to guard after submission
- APPROVED checklist triggers quality score recomputation

### Admin: Verify a Lead with Checklist Gate

**As an admin**, I want the system to require a completed verification checklist before I can mark a lead as verified, so we do not verify leads without proper owner confirmation.

**Acceptance Criteria**:

- "Verify Lead" action is blocked if no LEAD_VERIFICATION checklist instance exists for the lead, or if the existing instance is not APPROVED or SUBMITTED
- Admin sees a clear message: "Complete the lead verification checklist before verifying."
- Admin can create and assign a verification checklist from the lead detail page
- After checklist is submitted, "Verify Lead" action becomes available

### OPS: Complete Negotiation Documentation

**As an OPS agent**, I want to work through the mandatory post-agreement documentation checklist, so closure is unblocked only when all paperwork is in order.

**Acceptance Criteria**:

- NEGOTIATION_DOCS checklist instance is created automatically when negotiation reaches TOKEN_COLLECTED
- OPS sees checklist panel on negotiation detail page
- Auto-computed items (terms agreed, both signed, token collected, brokerage recorded) are pre-filled by the system
- Manual items (police verification, society NOC, owner KYC, agreement drafting, stamp/registration, rent agreement upload) require OPS action
- Negotiation cannot advance to READY_FOR_CLOSURE until all items are complete
- No override or bypass is available

### Admin: Manage Checklist Definitions

**As an admin**, I want to create and version checklist templates, so I can update inspection criteria without disrupting in-flight checklists.

**Acceptance Criteria**:

- Admin can create a new definition at `/admin/checklists/definitions`
- Admin can add sections and items with all supported item types
- Admin can set conditional visibility and required rules using the expression syntax
- Publishing a new version does not affect existing in-flight instances
- Admin can view version history and see which instances are on which version
- Admin can deactivate a definition to prevent new assignments

### Admin: Review Submitted Checklists

**As an admin**, I want to review submitted checklists and approve, reject, or request revisions, so quality is maintained and guards receive accurate feedback.

**Acceptance Criteria**:

- Review queue at `/admin/checklists/review` shows all SUBMITTED instances with filters by type and status
- Admin can view all responses, photos, and condition ratings
- Admin can approve, reject, or request revision with mandatory review notes
- APPROVED field inspection checklists trigger quality score recomputation
- REVISION_REQUESTED instances can be reopened by the assigned guard/OPS

---

## Business Rules

1. Exactly one non-cancelled instance per (subject_type, subject_id, checklist_type) combination. `create()` throws if a non-cancelled instance already exists for the same triple.
2. Instances pin to the `active_version_id` at creation time. Template updates after instance creation do not affect in-flight instances.
3. Only the `assigned_to` user can call `start()`, `updateResponse()`, and `submit()`.
4. Responses can only be updated when instance status is `IN_PROGRESS`.
5. Submission validates all effective required items after expression engine evaluation. Items hidden by `visible_if` are excluded from validation.
6. The `expected_version` parameter on `start()`, `updateResponse()`, and `submit()` must match the current `instance_version`. Mismatch throws a concurrency error: "Checklist was modified by another session. Refresh and try again."
7. `instance_version` is incremented on every mutation that changes instance state or responses.
8. Photo files must be JPEG or PNG, max 10MB each. `photo_metadata` entries must reference storage IDs present in `photo_ids`.
9. DOCUMENT items require a single file upload (PDF, JPEG, or PNG, max 20MB).
10. Admin/OPS review requires `checklists.review` permission.
11. Template management requires `checklists.manage` permission.
12. Tenant and Owner user types can only access read-only scoped queries (`getForTenant`, `getForOwner`).
13. APPROVED field inspection instances trigger `incentives.recomputeQualityScore()` for the assigned guard.
14. Mandatory gates block the downstream action entirely. Advisory gates show a warning but do not block.
15. Gate evaluation is recorded as a `GATE_EVALUATED` event regardless of outcome.
16. `forceComplete` (break-glass path from P30) is removed in the unified engine. Any override requires an explicit admin approval record with mandatory reason and a second approver (dual control).
17. Section weights for `WEIGHTED_COMPLETENESS` scoring must sum to 100. `publishVersion()` validates this.
18. `BINARY` scoring returns 100 only when all required items are complete; 0 otherwise. No partial credit.
19. Escalation cron runs every hour. Instances in SUBMITTED or UNDER_REVIEW for longer than `checklist_review_sla_hours` (default: 48, configurable in `system_config`) are escalated.
20. Escalation level 1: notification to reviewer. Level 2: reassign to team lead. Level 3: auto-reject with reason `ESCALATION_TIMEOUT`.
21. All money values in item responses are stored as strings (the NUMBER item type stores the raw string; conversion to paise happens in the consuming mutation, not in the checklist engine).
22. All authorization checks use `user_types.includes()` pattern, not `user_type ===`, to support P45 multi-persona users.

---

## Edge Cases

- **Guard submits with NA on required CONDITION items**: `NA` is a valid `condition_rating`. An item with `item_type: CONDITION` and `condition_rating: "NA"` passes validation. The guard is not penalized for marking inapplicable items as N/A.
- **Guard loses internet mid-checklist**: `updateResponse()` is idempotent for the same `(instance_id, section_id, item_id)` triple. Re-submitting the same response replaces the previous one safely. The `expected_version` check prevents stale overwrites.
- **Two sessions submit simultaneously**: The second `submit()` call will fail the `expected_version` check because the first submission incremented `instance_version`. The second caller receives a concurrency error and must refresh.
- **Definition deactivated after instance created**: The instance retains its pinned `version_id`. The definition's `is_active: false` only prevents new assignments; existing instances continue normally.
- **Version published while instances are in-flight**: In-flight instances continue on their pinned version. The new version applies only to instances created after the publish.
- **Zero required items in a version**: `BINARY` and `WEIGHTED_COMPLETENESS` algorithms return 100 when there are no required items. This is intentional.
- **Expression references a non-existent item**: The expression engine returns `false` for references to items not in the current response map. This means `visible_if` expressions referencing missing items hide the item (safe default).
- **Visit reassigned to different guard**: The checklist instance stays assigned to the original guard. Admin must cancel the existing instance and create a new one for the new guard.
- **Revision requested, guard does not respond**: Instance stays in `REVISION_REQUESTED`. Escalation cron applies after `checklist_review_sla_hours`. Admin can cancel the instance manually.
- **Lead verification checklist assigned but lead is rejected before completion**: Cancelling the lead does not auto-cancel the checklist instance. Admin must cancel the instance manually or it will escalate.
- **Multi-persona user (P45) is both Guard and OPS**: `requireFieldWorker()` returns the user record. The `assigned_to` check uses user ID, not user type. The user can execute their own instances regardless of which persona is active.
- **Negotiation DOCS checklist: auto-computed items fail validation**: Auto-computed items (terms agreed, both signed, token collected, brokerage recorded) are set by internal mutations when the corresponding records are created. If the source record is deleted or rolled back, the auto-computed item reverts to incomplete. The gate re-evaluates on every check.

---

## Known Risks (Adversarial Findings)

The following risks were identified during adversarial review of the unification strategy. Each has a mitigation built into this spec.

**Risk 1: Short-term regression in visit and closure flows during migration.**
Mitigation: Dual-write with read-compare during migration window. Gate parity tests must pass before cutover. Feature flags allow per-workflow rollback.

**Risk 2: Migration bugs from backfilling historical instances.**
Mitigation: Backfill runs as a one-time internal mutation with idempotency checks. Each backfilled instance records its source record ID in `checklist_events` metadata. Backfill can be re-run safely.

**Risk 3: Throughput drop from expression engine evaluation on every response save.**
Mitigation: Expression engine is a pure in-memory parser with no database reads. Evaluation is O(n) in the number of items. For typical checklists (10-30 items), this adds under 1ms per mutation. No caching needed in V1.

**Risk 4: `forceComplete` break-glass path without dual control.**
Mitigation: `forceComplete` is removed entirely from the unified engine. Any override requires an explicit `checklist_approvals` record with `outcome: APPROVED`, a mandatory `review_notes` explaining the override, and a second approver ID different from the instance's `assigned_to`. This is enforced in `review()`.

**Risk 5: Template edits silently altering in-flight behavior.**
Mitigation: Immutable version snapshots. In-flight instances pin to a `version_id`. Publishing a new version never touches existing instances.

**Risk 6: API-direct mutation paths bypassing UI-required fields.**
Mitigation: All validation (required items, photo requirements, expression evaluation) runs server-side in Convex mutations. The UI cannot bypass server validation. There is no separate "UI validation" layer.

**Risk 7: Multi-persona (P45) authorization failures.**
Mitigation: All authorization checks use `user_types.includes()`. The `requireFieldWorker()` helper is defined in `convex/auth.helpers.ts` and used by all checklist mutations that accept guard or OPS actors.

**Risk 8: Policy fragmentation persisting if Deal Room checklists are not migrated.**
Mitigation: Deal Room checklists (P25) are explicitly deferred to V2 with a documented migration path. The V2 migration will follow the same dual-write pattern. The risk is accepted and bounded: P25 checklists are isolated to the deal room and do not interact with the gate system used by other workflows.

---

## Decision Log

**D-P46-01**: Unified core runtime, not unified domain workflows.
The engine provides shared tables, shared state machines, and shared gate evaluation. Domain-specific behavior (field inspection scoring, negotiation closure gating) is expressed as configuration on the definition, not as separate code paths. This avoids a monolithic module while eliminating the policy fragmentation problem.

**D-P46-02**: Immutable version snapshots instead of mutable templates.
P30 templates were mutable, which meant template edits could silently change in-flight behavior. The new engine uses `checklist_versions` as immutable snapshots. Instances pin to a version ID at creation time. This is the CheckFlow pattern from external research.

**D-P46-03**: Optimistic concurrency via `instance_version` CAS token.
The P30 engine had no concurrency protection. Parallel `updateResponse()` calls from two sessions would cause last-write-wins corruption. The `expected_version` parameter on all mutating calls enforces compare-and-swap semantics.

**D-P46-04**: Expression engine is server-side only.
Client-side expression evaluation is permitted for UX responsiveness (hiding/showing items without a round-trip), but the server is authoritative. Submission validation always re-evaluates expressions server-side. This prevents any client-side bypass.

**D-P46-05**: `forceComplete` removed, replaced with dual-control approval.
The P30 `forceComplete` path was a break-glass mechanism with no second approver and no mandatory reason. It is removed entirely. Any override now requires an explicit approval record with a second approver. This is a security improvement, not just a code quality improvement.

**D-P46-06**: Deal Room checklists (P25) deferred to V2.
P25 checklists require deep integration with the AI term extraction pipeline and dual-party cryptographic sign-off. Migrating them in V1 carries disproportionate risk. They are isolated to the deal room and do not interact with the gate system. The V2 migration path is documented.

**D-P46-07**: `requireFieldWorker()` as the shared auth helper for guard and OPS actors.
P44 (OPS Superset) requires OPS users to execute checklists using the same mutations as guards. Rather than duplicating auth checks, a single `requireFieldWorker()` helper checks `user_types.includes("GUARD") || user_types.includes("OPS")`. This is also P45-compatible.

**D-P46-08**: Lead Verification checklist gate is mandatory in V1.
The enforcement audit found that no checklist exists at the lead verification step. This is the highest-risk gap: leads can be verified without any structured owner confirmation. The Lead Verification checklist gate is mandatory from day one of V1 deployment.

**D-P46-09**: Pre-Visit Readiness checklist gate is advisory in V1.
Guards are not yet accustomed to completing a readiness checklist before visits. Making it mandatory immediately would cause friction and visit cancellations. The gate is advisory in V1 (warning shown, not blocked). It becomes mandatory in V2 after adoption data is reviewed.

**D-P46-10**: Scoring algorithms are pluggable via `scoring_algorithm` field on definitions.
Different checklist types need different scoring semantics. Field inspection uses weighted completeness. Negotiation docs and handover use binary. Compliance checklists (V2) will use penalty-based. The algorithm is stored on the definition and evaluated by a strategy pattern in `lib/checklist-scoring.ts`.

**D-P46-11**: Migration uses dual-write with read-compare, not a big-bang cutover.
A big-bang cutover of five checklist subsystems simultaneously is too risky. Dual-write allows the new engine to run in parallel with the old engine, with discrepancies logged. Cutover happens per workflow type, gated by parity tests.

**D-P46-12**: `checklist_events` is append-only and never mutated.
The event log provides a complete audit trail of all state transitions and significant actions. It is separate from the main `audit_logs` table (which covers all business entities) to allow efficient per-instance queries without scanning the full audit log.

---

## Related Documents

- [Field Checklists](21-field-checklists.md) — P30 field inspection engine being migrated into this unified engine
- [Rent Negotiation](19-rent-negotiation.md) — P26 negotiation checklist being migrated; closure gate contract
- [Transaction Completion Rails](26-transaction-completion-rails.md) — P34 handover checklist being migrated; transaction completion gate contract
- [Deal Room](18-deal-room.md) — P25 deal room checklists (V2 migration target)
- [Visit Management](06-visit-management.md) — visits are subjects for FIELD_INSPECTION and PRE_VISIT_READINESS instances
- [Lead Pipeline](03-lead-pipeline.md) — leads are subjects for LEAD_VERIFICATION instances; gate blocks verify transition
- [OPS Portal](20-ops-portal.md) — OPS executes and reviews checklists via the field ops portal
- [Incentive V2](22-incentive-v2.md) — APPROVED field inspection instances trigger quality score recomputation
- [OPS Superset Expansion](35-ops-superset-expansion.md) — P44 OPS auth helper contract
- [Multi-Persona Identity Model](36-multi-persona-identity.md) — P45 user_types array pattern; requireFieldWorker() contract
- [State Machines](../04-state-machines.md) — transition validation patterns used throughout
- [Constants Reference](../13-constants-reference.md) — CHECKLIST_STATUS, CHECKLIST_TYPE, CHECKLIST_ITEM_TYPE, CONDITION_RATING enums
- [Convex Schema](../10-convex-schema.md) — table definitions and index patterns
