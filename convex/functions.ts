import {
  // eslint-disable-next-line no-restricted-imports -- this file is the definition site that wraps the raw mutation/internalMutation with audit triggers; it cannot import the wrapped versions from itself.
  internalMutation as rawInternalMutation,
  internalQuery as rawInternalQuery,
  // eslint-disable-next-line no-restricted-imports -- see above: definition site for the wrapped `mutation` export.
  mutation as rawMutation,
  query as rawQuery,
  type MutationCtx,
} from "./_generated/server";
import { type DataModel, type Doc, type Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import { TableAggregate } from "@convex-dev/aggregate";
import { TENANT_INQUIRY_STATUS, VISIT_STATUS } from "../lib/constants";

const triggers = new Triggers<DataModel>();

/** Namespace: `${society_id}|${status}`, Key: _creationTime */
export const leadCounts = new TableAggregate<{
  Namespace: string;
  Key: number;
  DataModel: DataModel;
  TableName: "leads";
}>(components.leadCounts, {
  namespace: (doc) => `${doc.society_id}|${doc.status}`,
  sortKey: (doc) => doc._creationTime,
});

/** Namespace: `${assigned_guard_id}|${status}`, Key: _creationTime */
export const visitCounts = new TableAggregate<{
  Namespace: string;
  Key: number;
  DataModel: DataModel;
  TableName: "visits";
}>(components.visitCounts, {
  namespace: (doc) => `${doc.assigned_guard_id}|${doc.status}`,
  sortKey: (doc) => doc._creationTime,
});

/** Namespace: status, Key: _creationTime, sumValue: amount_paise */
export const payoutTotals = new TableAggregate<{
  Namespace: string;
  Key: number;
  DataModel: DataModel;
  TableName: "payouts";
}>(components.payoutTotals, {
  namespace: (doc) => doc.status,
  sortKey: (doc) => doc._creationTime,
  sumValue: (doc) => doc.amount_paise,
});

triggers.register("leads", leadCounts.trigger());
triggers.register("visits", visitCounts.trigger());
triggers.register("payouts", payoutTotals.trigger());

triggers.register("visits", async (ctx, change) => {
  if (change.operation !== "update" || change.oldDoc === null || change.newDoc === null) {
    return;
  }

  const previousVisit = change.oldDoc;
  const currentVisit = change.newDoc;

  if (
    previousVisit.status === currentVisit.status ||
    (currentVisit.status !== VISIT_STATUS.CANCELLED &&
      currentVisit.status !== VISIT_STATUS.NO_SHOW) ||
    !currentVisit.tenant_inquiry_id
  ) {
    return;
  }

  const inquiry = await ctx.db.get(currentVisit.tenant_inquiry_id);

  if (!inquiry || inquiry.status !== TENANT_INQUIRY_STATUS.VISIT_SCHEDULED) {
    return;
  }

  await ctx.db.patch(inquiry._id, {
    status: TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
    visit_id: inquiry.visit_id === currentVisit._id ? undefined : inquiry.visit_id,
    updated_at: Date.now(),
  });
});

const AUDITED_TABLES = [
  "societies",
  "buildings",
  "users",
  "guard_profiles",
  "guard_shifts",
  "leads",
  "owners",
  "owner_rm_assignments",
  "rm_check_ins",
  "ops_kpi_targets",
  "ops_warnings",
  "ops_check_in_notes",
  "owner_verifications",
  "listings",
  "listing_trust_badges",
  "visits",
  "closures",
  "payouts",
  "referral_codes",
  "referrals",
  "referral_milestones",
  "referral_config",
  "incentive_cards",
  "incentive_actor_profiles",
  "deal_commission_evaluations",
  "commission_modifier_templates",
  "incentive_config_versions",
  "shadow_mode_deltas",
  "deal_contributions",
  "attribution_records",
  "attribution_splits",
  "incentive_disbursements",
  "gamification_profiles",
  "gamification_quests",
  "user_quest_progress",
  "quality_score_history",
  "guard_streaks",
  "payout_adjustments",
  "roles",
  "user_role_assignments",
  "system_config",
  "tenant_inquiries",
  "tenant_favorites",
  "rental_transactions",
  "rental_agreements",
  "kyc_packets",
  "token_bookings",
  "deposit_records",
  "handover_checklists",
  "negotiations",
  "negotiation_terms_proposals",
  "negotiation_terms_signatures",
  "negotiation_token_records",
  "chat_channels",
  "owner_invites",
  "chat_messages",
  "chat_message_batches",
  "chat_read_receipts",
  "deal_checklists",
  "deal_checklist_signatures",
  "checklist_templates",
  "checklist_instances",
  "document_requirements",
  "regulatory_items",
  "owner_service_requests",
  "support_inquiries",
  "notification_preferences",
  "notification_templates",
  "notifications",
  "transaction_fees",
  "tenant_passes",
  "partner_services",
  "service_bundles",
  "promoted_listings",
  "revenue_line_items",
  "voice_transcriptions",
] as const;

const SKIPPED_DIFF_FIELDS = new Set(["_id", "_creationTime"]);

type AuditedTable = (typeof AUDITED_TABLES)[number];
type AuditAction = Doc<"audit_logs">["action"];
type AuditActorType = Doc<"audit_logs">["actor_type"];

function computeChanges(
  oldDoc: Record<string, unknown> | null,
  newDoc: Record<string, unknown> | null,
):
  | Array<{
      field: string;
      old_value: unknown;
      new_value: unknown;
    }>
  | undefined {
  if (oldDoc === null && newDoc !== null) {
    const insertedFields = Object.entries(newDoc)
      .filter(([field]) => !SKIPPED_DIFF_FIELDS.has(field))
      .map(([field, newValue]) => ({
        field,
        old_value: null,
        new_value: newValue,
      }));

    return insertedFields.length > 0 ? insertedFields : undefined;
  }

  if (newDoc === null) {
    return undefined;
  }

  if (oldDoc === null) {
    return undefined;
  }

  const previousDoc: Record<string, unknown> = oldDoc;
  const currentDoc: Record<string, unknown> = newDoc;

  const changedFields: Array<{
    field: string;
    old_value: unknown;
    new_value: unknown;
  }> = [];

  const allFields = new Set([...Object.keys(previousDoc), ...Object.keys(currentDoc)]);

  for (const field of allFields) {
    if (SKIPPED_DIFF_FIELDS.has(field)) {
      continue;
    }

    const bigintReplacer = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
    if (
      JSON.stringify(previousDoc[field], bigintReplacer) ===
      JSON.stringify(currentDoc[field], bigintReplacer)
    ) {
      continue;
    }

    const oldValue = previousDoc[field] === undefined ? null : previousDoc[field];
    const newValue = currentDoc[field] === undefined ? null : currentDoc[field];

    changedFields.push({
      field,
      old_value: oldValue,
      new_value: newValue,
    });
  }

  return changedFields.length > 0 ? changedFields : undefined;
}

async function resolveActor(ctx: MutationCtx): Promise<{
  actor_user_id: Id<"users"> | undefined;
  actor_type: AuditActorType;
}> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    return {
      actor_user_id: undefined,
      actor_type: "SYSTEM",
    };
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", identity.subject))
    .unique();

  if (!user) {
    return {
      actor_user_id: undefined,
      actor_type: "SYSTEM",
    };
  }

  return {
    actor_user_id: user._id,
    actor_type:
      user.user_type === "GUARD" ||
      user.user_type === "ADMIN" ||
      user.user_type === "OPS" ||
      user.user_type === "TENANT" ||
      user.user_type === "OWNER"
        ? user.user_type
        : "SYSTEM",
  };
}

function buildAuditAction(
  tableName: AuditedTable,
  operation: "insert" | "update" | "delete",
): AuditAction {
  if (
    tableName === "incentive_actor_profiles" ||
    tableName === "deal_commission_evaluations" ||
    tableName === "commission_modifier_templates" ||
    tableName === "incentive_config_versions" ||
    tableName === "shadow_mode_deltas"
  ) {
    return "SYSTEM_CONFIG_UPDATE";
  }

  if (tableName === "deal_contributions") {
    return operation === "insert" ? "DEAL_CONTRIBUTIONS_CREATE" : "DEAL_CONTRIBUTIONS_UPDATE";
  }

  if (tableName === "attribution_records") {
    return operation === "insert" ? "ATTRIBUTION_RECORDS_CREATE" : "ATTRIBUTION_RECORDS_UPDATE";
  }

  if (tableName === "attribution_splits") {
    return "ATTRIBUTION_SPLITS_CREATE";
  }

  if (tableName === "incentive_disbursements") {
    return operation === "insert"
      ? "INCENTIVE_DISBURSEMENTS_CREATE"
      : "INCENTIVE_DISBURSEMENTS_UPDATE";
  }

  if (tableName === "gamification_profiles") {
    return operation === "insert" ? "GAMIFICATION_PROFILES_CREATE" : "GAMIFICATION_PROFILES_UPDATE";
  }

  if (tableName === "gamification_quests") {
    return operation === "insert" ? "GAMIFICATION_QUESTS_CREATE" : "GAMIFICATION_QUESTS_UPDATE";
  }

  if (tableName === "user_quest_progress") {
    return operation === "insert" ? "USER_QUEST_PROGRESS_CREATE" : "USER_QUEST_PROGRESS_UPDATE";
  }

  if (tableName === "listing_trust_badges") {
    return operation === "insert" ? "TRUST_BADGE_COMPUTE" : "TRUST_BADGE_UPDATE";
  }

  return `${tableName.toUpperCase()}_${operation.toUpperCase()}` as AuditAction;
}

function registerAuditTrigger(tableName: AuditedTable): void {
  triggers.register(tableName as Parameters<typeof triggers.register>[0], async (ctx, change) => {
    const { actor_user_id, actor_type } = await resolveActor(ctx);
    const action = buildAuditAction(tableName, change.operation);

    await ctx.db.insert("audit_logs", {
      actor_user_id,
      actor_type,
      action,
      entity_type: tableName,
      entity_id: change.id as string,
      changes: computeChanges(change.oldDoc, change.newDoc),
      metadata: undefined,
    });
  });
}

for (const tableName of AUDITED_TABLES) {
  registerAuditTrigger(tableName);
}

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));
export const query = rawQuery;
export const internalQuery = rawInternalQuery;
