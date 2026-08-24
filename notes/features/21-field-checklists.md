# Feature: Field Checklists

> **Priority**: Phase 30 (Field Ops Platform)
> **Personas**: Guard (execution), Admin/OPS (template management + review), System (scoring)
> **Dependencies**: Visit Management (F06), OPS Portal (F20), Incentive V2 (F22)

## Purpose

Field checklists give guards a structured inspection workflow during property visits. Instead of free-form notes, guards work through a template of items — rating conditions, checking boxes, entering measurements, and capturing GPS-tagged photos. Completed checklists feed directly into the quality scoring engine: a guard's `completeness_score` on approved checklists is the single largest component (30%) of their quality score.

Two checklist types exist: `PROPERTY_INSPECTION` (used during tenant visits to document flat condition) and `MOVE_IN_HANDOVER` (used at move-in to create a formal handover record). Both share the same template/instance architecture.

---

## Entities Involved

- `checklist_templates` table — reusable templates with sections and items
- `checklist_instances` table — one instance per visit, linked to a template
- `visits` table — checklist submission gates visit completion scoring
- `quality_score_history` table — checklist score feeds quality computation

---

## Template Architecture

### Template Structure

A `checklist_templates` record defines the full inspection blueprint. Templates are depth-aware: each item has a `min_depth` that controls which depth tiers include it.

```typescript
// checklist_templates table
{
  name: string,                    // e.g., "Standard Property Inspection"
  description?: string,
  depth: ChecklistDepth,           // LIGHT | MEDIUM | FULL (template's maximum depth)
  is_active: boolean,              // only active templates can be assigned
  is_deleted: boolean,
  sections: Array<{
    section_id: string,            // stable UUID, never changes
    title: string,                 // e.g., "Living Room", "Kitchen", "Bathrooms"
    description?: string,
    items: Array<{
      item_id: string,             // stable UUID, never changes
      label: string,               // e.g., "Walls and ceiling condition"
      item_type: ChecklistItemType,
      is_required: boolean,        // required items block submission if incomplete
      requires_photo: boolean,     // photo evidence mandatory for this item
      min_depth: ChecklistDepth,   // LIGHT items appear in all depths; FULL items only in FULL
    }>
  }>
}
```

### Depth Model

| Depth    | Description                  | Use Case                            |
| -------- | ---------------------------- | ----------------------------------- |
| `LIGHT`  | Quick 5-10 item check        | Routine visits, time-constrained    |
| `MEDIUM` | Standard 15-25 item check    | Normal property inspections         |
| `FULL`   | Comprehensive 30+ item check | Move-in handovers, premium listings |

Depth is set per-instance at assignment time. The `filterSectionsByDepth()` function in `convex/checklists.ts` filters template items to only those with `min_depth` at or below the instance's depth. Items with `min_depth: "LIGHT"` appear in all three depths. Items with `min_depth: "FULL"` only appear in FULL depth instances.

### Checklist Types

| Type                  | Constant                             | When Used                                                |
| --------------------- | ------------------------------------ | -------------------------------------------------------- |
| `PROPERTY_INSPECTION` | `CHECKLIST_TYPE.PROPERTY_INSPECTION` | Tenant visit — document current flat condition           |
| `MOVE_IN_HANDOVER`    | `CHECKLIST_TYPE.MOVE_IN_HANDOVER`    | Move-in day — formal handover record with tenant present |

The checklist type is a property of the template, not the instance. Admin creates separate templates for each type.

---

## Item Taxonomy

Six item types cover all inspection scenarios:

| Type              | Constant                              | Guard Input                                 | Validation                                       |
| ----------------- | ------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| `CONDITION`       | `CHECKLIST_ITEM_TYPE.CONDITION`       | Select rating (EXCELLENT/GOOD/FAIR/POOR/NA) | `condition_rating` required                      |
| `CHECKBOX`        | `CHECKLIST_ITEM_TYPE.CHECKBOX`        | Toggle yes/no                               | `value` must be `"true"` or `"false"`            |
| `TEXT`            | `CHECKLIST_ITEM_TYPE.TEXT`            | Free text entry                             | `value` non-empty string                         |
| `NUMBER`          | `CHECKLIST_ITEM_TYPE.NUMBER`          | Numeric entry                               | `value` must parse as finite number              |
| `PHOTO`           | `CHECKLIST_ITEM_TYPE.PHOTO`           | Upload 1+ photos                            | `photo_ids.length > 0`                           |
| `PHOTO_CONDITION` | `CHECKLIST_ITEM_TYPE.PHOTO_CONDITION` | Photo + condition rating                    | Both `photo_ids` and `condition_rating` required |

### Condition Ratings

| Rating      | Constant                     | Meaning                                |
| ----------- | ---------------------------- | -------------------------------------- |
| `EXCELLENT` | `CONDITION_RATING.EXCELLENT` | No issues, pristine                    |
| `GOOD`      | `CONDITION_RATING.GOOD`      | Minor wear, fully functional           |
| `FAIR`      | `CONDITION_RATING.FAIR`      | Visible wear, functional               |
| `POOR`      | `CONDITION_RATING.POOR`      | Significant damage or non-functional   |
| `NA`        | `CONDITION_RATING.NA`        | Item not applicable (e.g., no balcony) |

### Photo Requirements

- Maximum file size: 10MB per photo (enforced in `validatePhotoAssets()`)
- Allowed formats: JPEG and PNG only
- GPS metadata is optional but strongly encouraged — GPS-tagged photos boost the photo quality component by +10 points
- Photos are stored in Convex file storage (`_storage`). Each response stores both `photo_ids` (array of storage IDs) and `photo_metadata` (array of `{ storage_id, taken_at, lat?, lng? }`)
- `photo_metadata` entries MUST reference storage IDs present in `photo_ids`

---

## Instance Lifecycle

One checklist instance is created per visit. The instance tracks the guard's progress through the template items.

### Status Transitions

```
ASSIGNED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED
                                                   → REJECTED
                                                   → REVISION_REQUESTED → IN_PROGRESS
```

| Transition                          | Who       | How                                                                                         |
| ----------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| `ASSIGNED → IN_PROGRESS`            | Guard     | `checklists.startChecklist({ checklist_id })`                                               |
| `IN_PROGRESS → SUBMITTED`           | Guard     | `checklists.submitChecklist({ checklist_id })`                                              |
| `SUBMITTED → UNDER_REVIEW`          | Admin/OPS | Auto-transition when `reviewChecklist()` is called on a SUBMITTED instance                  |
| `UNDER_REVIEW → APPROVED`           | Admin/OPS | `checklists.reviewChecklist({ checklist_id, outcome: "APPROVED", review_notes })`           |
| `UNDER_REVIEW → REJECTED`           | Admin/OPS | `checklists.reviewChecklist({ checklist_id, outcome: "REJECTED", review_notes })`           |
| `UNDER_REVIEW → REVISION_REQUESTED` | Admin/OPS | `checklists.reviewChecklist({ checklist_id, outcome: "REVISION_REQUESTED", review_notes })` |
| `REVISION_REQUESTED → IN_PROGRESS`  | Guard     | `checklists.startChecklist({ checklist_id })` (re-opens for editing)                        |

Terminal states: `APPROVED`, `REJECTED`.

### Transition Validation

The `VALID_CHECKLIST_TRANSITIONS` map in `convex/checklists.ts` is the authoritative source:

```typescript
const VALID_CHECKLIST_TRANSITIONS: Record<ChecklistStatus, ChecklistStatus[]> = {
  ASSIGNED: [IN_PROGRESS],
  IN_PROGRESS: [SUBMITTED],
  SUBMITTED: [UNDER_REVIEW],
  UNDER_REVIEW: [APPROVED, REJECTED, REVISION_REQUESTED],
  REVISION_REQUESTED: [IN_PROGRESS],
  APPROVED: [],
  REJECTED: [],
};
```

---

## Completeness Score

The `completeness_score` field (0–100 integer) on each instance measures how many required items have valid responses.

### Calculation

```typescript
// From convex/checklists.ts: calculateCompletenessScore()
function calculateCompletenessScore(instance, templateSections, depth): number {
  const requiredItems = getTemplateItemsForDepth(templateSections, depth).filter(
    (item) => item.is_required,
  );

  if (requiredItems.length === 0) return 100;

  const completedRequired = requiredItems.filter((item) => {
    const response = instance.responses.find(
      (r) => r.item_id === item.item_id && r.section_id === item.section_id,
    );
    return isResponseValidForItem(response, item);
  }).length;

  return Math.round((completedRequired / requiredItems.length) * 100);
}
```

The score is recalculated on every `updateResponse()` call and again on `submitChecklist()`. The final score stored at submission time is the authoritative value used by the quality scoring engine.

### Score Thresholds (for Quality Engine)

| Score | Interpretation                                                                         |
| ----- | -------------------------------------------------------------------------------------- |
| 100   | Full checklist bonus eligible (`BONUS_TYPE.FULL_CHECKLIST`)                            |
| < 40  | Low completeness penalty applied (`PENALTY_TYPE.LOW_COMPLETENESS`, ₹500 = 50000 paise) |

---

## Guard Execution Flow

### Step 1: Receive Assignment

Guard sees a checklist badge on their visit card in `/guard/visits`. The badge shows the checklist status (ASSIGNED, IN_PROGRESS, etc.).

### Step 2: Start Checklist

Guard taps "Start Checklist" on the visit detail page.

```
checklists.startChecklist({ checklist_id })
→ Status: ASSIGNED → IN_PROGRESS
→ started_at timestamp recorded
```

### Step 3: Fill Items

Guard works through sections one by one. For each item:

- **CONDITION**: Tap a rating button (Excellent / Good / Fair / Poor / N/A)
- **CHECKBOX**: Toggle on/off
- **TEXT**: Type a description
- **NUMBER**: Enter a number (e.g., meter reading)
- **PHOTO**: Tap to open camera, capture photo(s). GPS coordinates captured automatically if location permission granted.
- **PHOTO_CONDITION**: Capture photo(s) AND select a condition rating

Each item save calls:

```
checklists.updateResponse({
  checklist_id,
  item_id,
  section_id,
  value?,
  condition_rating?,
  photo_ids,
  photo_metadata,
  notes?
})
```

Responses can be updated multiple times while the checklist is IN_PROGRESS. The latest response for each `(item_id, section_id)` pair replaces the previous one.

### Step 4: Submit

Guard taps "Submit Checklist" when all required items are complete.

```
checklists.submitChecklist({ checklist_id })
→ Validates all required items have valid responses
→ Validates photo requirements for items with requires_photo: true
→ Status: IN_PROGRESS → SUBMITTED
→ submitted_at timestamp recorded
→ completeness_score finalized
```

Submission fails if any required item is missing or invalid. The error message names the specific item: `"Missing required response for item: Walls and ceiling condition"`.

### Visit Completion Gating

A visit's quality score computation considers checklist status. The quality engine in `recomputeQualityScore()` only counts checklists in completion states (`SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `REVISION_REQUESTED`) toward the checklist component. Checklists still in `ASSIGNED` or `IN_PROGRESS` are excluded.

Guards are strongly incentivized to submit checklists before completing visits — the checklist component is 30% of their quality score.

---

## Admin/OPS Review Flow

### Review Queue (`/admin/checklists` or `/ops/handover`)

Admin and OPS see a review queue of submitted checklists. The `checklists.listForReview()` query returns instances with optional status filter, enriched with guard name, template name, and visit details.

```typescript
checklists.listForReview({ status?: ChecklistStatus, limit?: number })
// Requires: visits.view permission
// Returns: instances with assigned_user, template, visit details
```

### Review Actions

Admin/OPS opens a checklist detail view showing all responses, photos, and condition ratings.

```typescript
checklists.reviewChecklist({
  checklist_id,
  outcome: "APPROVED" | "REJECTED" | "REVISION_REQUESTED",
  review_notes: string, // required
});
// Requires: visits.edit permission
```

**On APPROVED**: Triggers `incentives.recomputeQualityScore({ guard_user_id, trigger: "CHECKLIST_APPROVED" })` via internal mutation. This updates the guard's quality score and potentially unlocks streak milestones.

**On REVISION_REQUESTED**: Guard can re-open the checklist (REVISION_REQUESTED → IN_PROGRESS) and update their responses. The `review_notes` field explains what needs fixing.

**On REJECTED**: Terminal. Guard cannot resubmit. A new checklist instance would need to be created for the same visit (admin action).

### Photo Viewer

```typescript
checklists.getPhotoUrls({ checklist_id });
// Returns: Array<{ storage_id, url }>
// Resolves all unique photo storage IDs to signed URLs
```

---

## Convex Functions

### Queries

```typescript
checklists.getByVisitId({ visit_id })
// Returns the checklist instance for a visit (or null)
// Guard can only read their own; admin/OPS can read all

checklists.getById({ checklist_id })
// Returns a specific instance
// Same access rules as getByVisitId

checklists.getPhotoUrls({ checklist_id })
// Returns signed URLs for all photos in the instance

checklists.listForReview({ status?, limit? })
// Admin/OPS review queue
// Requires: visits.view permission
```

### Mutations

```typescript
checklists.createInstance({ template_id, visit_id, assigned_to, depth })
// Admin/OPS creates a checklist for a visit
// Requires: visits.create permission
// Validates: template active, visit exists, assignee is the visit's guard, no existing instance

checklists.createInstanceInternal({ template_id, visit_id, assigned_to, assigned_by, depth })
// Internal mutation — called by other mutations (e.g., auto-create on visit creation)

checklists.startChecklist({ checklist_id })
// Guard starts working on their checklist
// Requires: assigned user only

checklists.updateResponse({ checklist_id, item_id, section_id, value?, condition_rating?, photo_ids, photo_metadata, notes? })
// Guard saves a response for one item
// Requires: assigned user only, status must be IN_PROGRESS

checklists.submitChecklist({ checklist_id })
// Guard submits completed checklist
// Requires: assigned user only
// Validates: all required items complete, all photo requirements met

checklists.reviewChecklist({ checklist_id, outcome, review_notes })
// Admin/OPS reviews a submitted checklist
// Requires: visits.edit permission
// On APPROVED: triggers quality score recomputation

checklists.generateUploadUrl()
// Returns a Convex storage upload URL for photo uploads
// Requires: any authenticated user
```

---

## Template Management (Admin)

Admin creates and manages templates at `/admin/checklists/templates`.

### Create Template

1. Enter name, description, depth (LIGHT/MEDIUM/FULL)
2. Add sections (e.g., "Living Room", "Kitchen")
3. For each section, add items with type, required flag, photo requirement, and min_depth
4. Save as inactive draft
5. Activate when ready for use

### Template Constraints

- A template cannot be deleted if active instances reference it (soft delete only)
- Changing a template does NOT affect existing instances — instances snapshot the template at creation time via the `responses` array structure
- `section_id` and `item_id` values are stable UUIDs — never change after creation
- Only `is_active: true` templates can be assigned to new visits

---

## Business Rules

1. Exactly one checklist instance per visit. `createInstance()` throws if an instance already exists for the visit.
2. The checklist assignee MUST match the visit's `assigned_guard_id`. Mismatches throw at creation time.
3. Only the assigned user can call `startChecklist()`, `updateResponse()`, and `submitChecklist()`.
4. Responses can only be updated when status is `IN_PROGRESS`.
5. Submission validates ALL required items — not just the ones the guard touched. Missing required items block submission.
6. Photo files MUST be JPEG or PNG, max 10MB each.
7. `photo_metadata` entries MUST reference storage IDs present in `photo_ids`.
8. Admin/OPS review requires `visits.edit` permission (not a separate checklist permission).
9. APPROVED checklists trigger quality score recomputation for the assigned guard.
10. TENANT and OWNER user types cannot access checklists at all.
11. Guards can only read checklists assigned to them.
12. Depth filtering is applied at query time — items with `min_depth` above the instance depth are excluded from validation and scoring.

---

## Edge Cases

- **Guard submits with NA on required items**: `NA` is a valid `CONDITION_RATING` value. An item with `item_type: CONDITION` and `condition_rating: "NA"` passes validation. The guard is not penalized for marking inapplicable items as N/A.
- **Guard loses internet mid-checklist**: `updateResponse()` is idempotent for the same `(item_id, section_id)` pair. Re-submitting the same response replaces the previous one safely.
- **Visit reassigned to different guard**: The checklist instance stays assigned to the original guard. Admin must manually create a new instance for the new guard if needed.
- **Template deactivated after instance created**: The instance retains its snapshot of the template structure via the `responses` array. `getTemplateForInstance()` still loads the template (soft-deleted check only), so existing instances continue to work.
- **Revision requested, guard doesn't respond**: Instance stays in `REVISION_REQUESTED`. No auto-timeout. Admin can reject it manually.
- **Zero required items in template**: `calculateCompletenessScore()` returns 100 when `requiredItems.length === 0`. This is intentional — a template with only optional items is always "complete."

---

## Related Documents

- [Visit Management](06-visit-management.md) — checklists are linked to visits; checklist submission gates quality scoring
- [OPS Portal](20-ops-portal.md) — OPS reviews submitted checklists via the handover page
- [Incentive V2](22-incentive-v2.md) — checklist completeness_score is 30% of quality score; APPROVED checklists trigger recomputation
- [Closure & Payouts](07-closure-and-payouts.md) — checklist quality feeds payout adjustment engine
- [Constants Reference](../13-constants-reference.md) — CHECKLIST_STATUS, CHECKLIST_DEPTH, CHECKLIST_ITEM_TYPE, CONDITION_RATING, CHECKLIST_TYPE
- [Convex Schema](../10-convex-schema.md) — checklist_templates and checklist_instances table definitions
