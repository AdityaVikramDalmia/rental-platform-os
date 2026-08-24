import { v } from "convex/values";
import {
  NEGOTIATION_CHECKLIST_ITEM_STATUS,
  NEGOTIATION_STATUS,
  PERMISSIONS,
  TOKEN_RECORD_STATUS,
  type NegotiationChecklistItemStatus,
} from "../lib/constants";
import { isNegotiationTerminal, validateNegotiationTransition } from "../lib/negotiation";
import { requireAdmin, requireBackoffice, requirePermission } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { ALLOWED_PDF_CONTENT_TYPES, validateStoredFile } from "./storageValidation";

type NegotiationDoc = Doc<"negotiations">;
type ChecklistReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

type ManualChecklistItemKey =
  | "police_verification_status"
  | "society_noc_status"
  | "owner_kyc_status"
  | "rent_agreement_status"
  | "key_handover_status"
  | "move_in_inspection_status";

type ManualChecklistStatusField =
  | "police_verification_status"
  | "society_noc_status"
  | "owner_kyc_status"
  | "rent_agreement_status"
  | "key_handover_status"
  | "move_in_inspection_status";

type ManualChecklistWaiveReasonField =
  | "police_verification_waive_reason"
  | "society_noc_waive_reason"
  | "owner_kyc_waive_reason"
  | "rent_agreement_waive_reason"
  | "key_handover_waive_reason"
  | "move_in_inspection_waive_reason";

type ChecklistPatch = Partial<
  Pick<
    NegotiationDoc,
    | ManualChecklistStatusField
    | ManualChecklistWaiveReasonField
    | "rent_agreement_storage_id"
    | "move_in_inspection_notes"
    | "status"
    | "ready_for_closure_at"
    | "last_activity_at"
  >
>;

const manualChecklistItemKeyValidator = v.union(
  v.literal("police_verification_status"),
  v.literal("society_noc_status"),
  v.literal("owner_kyc_status"),
  v.literal("rent_agreement_status"),
  v.literal("key_handover_status"),
  v.literal("move_in_inspection_status"),
);

const checklistItemStatusValidator = v.union(
  v.literal(NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING),
  v.literal(NEGOTIATION_CHECKLIST_ITEM_STATUS.IN_PROGRESS),
  v.literal(NEGOTIATION_CHECKLIST_ITEM_STATUS.COMPLETED),
  v.literal(NEGOTIATION_CHECKLIST_ITEM_STATUS.OBTAINED),
  v.literal(NEGOTIATION_CHECKLIST_ITEM_STATUS.VERIFIED),
  v.literal(NEGOTIATION_CHECKLIST_ITEM_STATUS.DRAFT_READY),
  v.literal(NEGOTIATION_CHECKLIST_ITEM_STATUS.STAMP_REGISTERED),
  v.literal(NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED),
);

const TERMS_AGREED_OR_LATER_STATUSES = new Set<NegotiationDoc["status"]>([
  NEGOTIATION_STATUS.TERMS_AGREED,
  NEGOTIATION_STATUS.TOKEN_COLLECTED,
  NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
  NEGOTIATION_STATUS.READY_FOR_CLOSURE,
  NEGOTIATION_STATUS.CLOSED,
]);

const MANUAL_CHECKLIST_CONFIG: Record<
  ManualChecklistItemKey,
  {
    statusField: ManualChecklistStatusField;
    waiveReasonField: ManualChecklistWaiveReasonField;
    allowedStatuses: readonly NegotiationChecklistItemStatus[];
    terminalStatuses: readonly NegotiationChecklistItemStatus[];
  }
> = {
  police_verification_status: {
    statusField: "police_verification_status",
    waiveReasonField: "police_verification_waive_reason",
    allowedStatuses: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.IN_PROGRESS,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.COMPLETED,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED,
    ],
    terminalStatuses: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.COMPLETED,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED,
    ],
  },
  society_noc_status: {
    statusField: "society_noc_status",
    waiveReasonField: "society_noc_waive_reason",
    allowedStatuses: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.OBTAINED,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED,
    ],
    terminalStatuses: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.OBTAINED,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED,
    ],
  },
  owner_kyc_status: {
    statusField: "owner_kyc_status",
    waiveReasonField: "owner_kyc_waive_reason",
    allowedStatuses: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.VERIFIED,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED,
    ],
    terminalStatuses: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.VERIFIED,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED,
    ],
  },
  rent_agreement_status: {
    statusField: "rent_agreement_status",
    waiveReasonField: "rent_agreement_waive_reason",
    allowedStatuses: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.DRAFT_READY,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.STAMP_REGISTERED,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED,
    ],
    terminalStatuses: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.STAMP_REGISTERED,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED,
    ],
  },
  key_handover_status: {
    statusField: "key_handover_status",
    waiveReasonField: "key_handover_waive_reason",
    allowedStatuses: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.COMPLETED,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED,
    ],
    terminalStatuses: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.COMPLETED,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED,
    ],
  },
  move_in_inspection_status: {
    statusField: "move_in_inspection_status",
    waiveReasonField: "move_in_inspection_waive_reason",
    allowedStatuses: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.COMPLETED,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED,
    ],
    terminalStatuses: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.COMPLETED,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED,
    ],
  },
};

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

async function getNegotiationOrThrow(
  ctx: ChecklistReadCtx,
  negotiationId: Id<"negotiations">,
): Promise<NegotiationDoc> {
  const negotiation = await ctx.db.get(negotiationId);

  if (!negotiation || negotiation.is_deleted) {
    throw new Error("Negotiation not found");
  }

  return negotiation;
}

function ensureChecklistEditable(negotiation: NegotiationDoc): void {
  if (isNegotiationTerminal(negotiation.status)) {
    throw new Error("Cannot update checklist for terminal negotiation");
  }

  if (
    negotiation.status !== NEGOTIATION_STATUS.TOKEN_COLLECTED &&
    negotiation.status !== NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS
  ) {
    throw new Error("Checklist can only be updated after token collection");
  }
}

function isStatusAllowedForItem(
  itemKey: ManualChecklistItemKey,
  status: NegotiationChecklistItemStatus,
): boolean {
  return MANUAL_CHECKLIST_CONFIG[itemKey].allowedStatuses.includes(status);
}

async function computeAutoChecklistItems(
  ctx: ChecklistReadCtx,
  negotiation: NegotiationDoc,
): Promise<{
  terms_agreed: boolean;
  both_parties_signed: boolean;
  token_collected: boolean;
  brokerage_recorded: boolean;
}> {
  const termsAgreed = TERMS_AGREED_OR_LATER_STATUSES.has(negotiation.status);

  let bothPartiesSigned = false;
  let brokerageRecorded = false;

  if (negotiation.active_proposal_id) {
    const activeProposal = await ctx.db.get(negotiation.active_proposal_id);

    if (
      activeProposal &&
      !activeProposal.is_deleted &&
      activeProposal.negotiation_id.toString() === negotiation._id.toString()
    ) {
      const signatures = await ctx.db
        .query("negotiation_terms_signatures")
        .withIndex("by_proposal_id", (q) => q.eq("proposal_id", activeProposal._id))
        .collect();

      const activeSignatures = signatures.filter((signature) => !signature.is_deleted);
      const hasTenantSignature = activeSignatures.some(
        (signature) => signature.user_role === "TENANT",
      );
      const hasOwnerSignature = activeSignatures.some(
        (signature) => signature.user_role === "OWNER",
      );

      bothPartiesSigned = hasTenantSignature && hasOwnerSignature;
      brokerageRecorded =
        Number.isInteger(activeProposal.brokerage_tenant_side_paise) &&
        activeProposal.brokerage_tenant_side_paise >= 0 &&
        Number.isInteger(activeProposal.brokerage_owner_side_paise) &&
        activeProposal.brokerage_owner_side_paise >= 0;
    }
  }

  const tokenRecords = await ctx.db
    .query("negotiation_token_records")
    .withIndex("by_negotiation_id", (q) => q.eq("negotiation_id", negotiation._id))
    .collect();

  const tokenCollected = tokenRecords.some(
    (record) => !record.is_deleted && record.status === TOKEN_RECORD_STATUS.COLLECTED,
  );

  return {
    terms_agreed: termsAgreed,
    both_parties_signed: bothPartiesSigned,
    token_collected: tokenCollected,
    brokerage_recorded: brokerageRecorded,
  };
}

function resolveManualStatusOrPending(
  itemKey: ManualChecklistItemKey,
  status: string | undefined,
): NegotiationChecklistItemStatus {
  if (!status) {
    return NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING;
  }

  const allowedStatuses = MANUAL_CHECKLIST_CONFIG[itemKey].allowedStatuses;
  const matchedStatus = allowedStatuses.find((allowedStatus) => allowedStatus === status);
  return matchedStatus ?? NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING;
}

function isManualItemComplete(
  itemKey: ManualChecklistItemKey,
  status: NegotiationChecklistItemStatus,
): boolean {
  return MANUAL_CHECKLIST_CONFIG[itemKey].terminalStatuses.includes(status);
}

async function buildChecklistStatus(ctx: ChecklistReadCtx, negotiation: NegotiationDoc) {
  const autoItems = await computeAutoChecklistItems(ctx, negotiation);

  const policeVerificationStatus = resolveManualStatusOrPending(
    "police_verification_status",
    negotiation.police_verification_status,
  );
  const societyNocStatus = resolveManualStatusOrPending(
    "society_noc_status",
    negotiation.society_noc_status,
  );
  const ownerKycStatus = resolveManualStatusOrPending(
    "owner_kyc_status",
    negotiation.owner_kyc_status,
  );
  const rentAgreementStatus = resolveManualStatusOrPending(
    "rent_agreement_status",
    negotiation.rent_agreement_status,
  );
  const keyHandoverStatus = resolveManualStatusOrPending(
    "key_handover_status",
    negotiation.key_handover_status,
  );
  const moveInInspectionStatus = resolveManualStatusOrPending(
    "move_in_inspection_status",
    negotiation.move_in_inspection_status,
  );

  const manualCompletion = {
    police_verification_status: isManualItemComplete(
      "police_verification_status",
      policeVerificationStatus,
    ),
    society_noc_status: isManualItemComplete("society_noc_status", societyNocStatus),
    owner_kyc_status: isManualItemComplete("owner_kyc_status", ownerKycStatus),
    rent_agreement_status: isManualItemComplete("rent_agreement_status", rentAgreementStatus),
    key_handover_status: isManualItemComplete("key_handover_status", keyHandoverStatus),
    move_in_inspection_status: isManualItemComplete(
      "move_in_inspection_status",
      moveInInspectionStatus,
    ),
  };

  const autoCompletionValues = Object.values(autoItems);
  const manualCompletionValues = Object.values(manualCompletion);
  const completedItemsCount =
    autoCompletionValues.filter(Boolean).length + manualCompletionValues.filter(Boolean).length;
  const isReadyForClosure =
    autoCompletionValues.every(Boolean) && manualCompletionValues.every(Boolean);

  return {
    negotiation_id: negotiation._id,
    negotiation_status: negotiation.status,
    auto_items: autoItems,
    manual_items: {
      police_verification_status: {
        status: policeVerificationStatus,
        waive_reason: negotiation.police_verification_waive_reason,
      },
      society_noc_status: {
        status: societyNocStatus,
        waive_reason: negotiation.society_noc_waive_reason,
      },
      owner_kyc_status: {
        status: ownerKycStatus,
        waive_reason: negotiation.owner_kyc_waive_reason,
      },
      rent_agreement_status: {
        status: rentAgreementStatus,
        waive_reason: negotiation.rent_agreement_waive_reason,
        rent_agreement_file_id: negotiation.rent_agreement_storage_id,
      },
      key_handover_status: {
        status: keyHandoverStatus,
        waive_reason: negotiation.key_handover_waive_reason,
      },
      move_in_inspection_status: {
        status: moveInInspectionStatus,
        waive_reason: negotiation.move_in_inspection_waive_reason,
        notes: negotiation.move_in_inspection_notes,
      },
    },
    completed_items_count: completedItemsCount,
    total_items: 10,
    is_ready_for_closure: isReadyForClosure,
  };
}

async function transitionToDocumentationInProgressIfNeeded(
  ctx: MutationCtx,
  negotiation: NegotiationDoc,
  now: number,
): Promise<void> {
  if (negotiation.status !== NEGOTIATION_STATUS.TOKEN_COLLECTED) {
    return;
  }

  if (
    !validateNegotiationTransition(
      NEGOTIATION_STATUS.TOKEN_COLLECTED,
      NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
    )
  ) {
    throw new Error(
      "Invalid negotiation status transition from TOKEN_COLLECTED to DOCUMENTATION_IN_PROGRESS",
    );
  }

  await ctx.db.patch(negotiation._id, {
    status: NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
    last_activity_at: now,
  });
}

async function transitionToReadyForClosureIfNeeded(
  ctx: MutationCtx,
  negotiation: NegotiationDoc,
  now: number,
): Promise<void> {
  const checklistStatus = await buildChecklistStatus(ctx, negotiation);

  if (!checklistStatus.is_ready_for_closure) {
    return;
  }

  if (negotiation.status === NEGOTIATION_STATUS.READY_FOR_CLOSURE) {
    if (!negotiation.ready_for_closure_at) {
      await ctx.db.patch(negotiation._id, {
        ready_for_closure_at: now,
        last_activity_at: now,
      });
    }

    return;
  }

  if (!validateNegotiationTransition(negotiation.status, NEGOTIATION_STATUS.READY_FOR_CLOSURE)) {
    throw new Error(
      `Invalid negotiation status transition from ${negotiation.status} to READY_FOR_CLOSURE`,
    );
  }

  await ctx.db.patch(negotiation._id, {
    status: NEGOTIATION_STATUS.READY_FOR_CLOSURE,
    ready_for_closure_at: now,
    last_activity_at: now,
  });
}

export const updateChecklistItem = mutation({
  args: {
    negotiation_id: v.id("negotiations"),
    item_key: manualChecklistItemKeyValidator,
    status: checklistItemStatusValidator,
    waive_reason: v.optional(v.string()),
    file_id: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    if (args.status === NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED) {
      throw new Error("Use waiveItem to waive a checklist item");
    }

    if (args.waive_reason !== undefined) {
      throw new Error("waive_reason is only allowed in waiveItem");
    }

    if (args.file_id !== undefined && args.item_key !== "rent_agreement_status") {
      throw new Error("file_id is only allowed for rent_agreement_status");
    }

    if (args.notes !== undefined && args.item_key !== "move_in_inspection_status") {
      throw new Error("notes is only allowed for move_in_inspection_status");
    }

    if (!isStatusAllowedForItem(args.item_key, args.status)) {
      throw new Error(`Invalid status ${args.status} for checklist item ${args.item_key}`);
    }

    const negotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);
    ensureChecklistEditable(negotiation);

    if (
      args.item_key === "rent_agreement_status" &&
      (args.status === NEGOTIATION_CHECKLIST_ITEM_STATUS.COMPLETED ||
        args.status === NEGOTIATION_CHECKLIST_ITEM_STATUS.STAMP_REGISTERED) &&
      args.file_id === undefined &&
      negotiation.rent_agreement_storage_id === undefined
    ) {
      throw new Error("Rent agreement file must be uploaded before marking complete.");
    }

    const now = Date.now();
    const itemConfig = MANUAL_CHECKLIST_CONFIG[args.item_key];

    const patch: ChecklistPatch = {
      last_activity_at: now,
    };

    patch[itemConfig.statusField] = args.status;
    patch[itemConfig.waiveReasonField] = undefined;

    if (args.item_key === "rent_agreement_status" && args.file_id !== undefined) {
      await validateStoredFile(ctx, args.file_id, {
        fieldName: "file_id",
        allowedContentTypes: ALLOWED_PDF_CONTENT_TYPES,
        allowedLabel: "PDF",
      });

      patch.rent_agreement_storage_id = args.file_id;
    }

    if (args.item_key === "move_in_inspection_status" && args.notes !== undefined) {
      patch.move_in_inspection_notes = normalizeOptionalString(args.notes);
    }

    await ctx.db.patch(negotiation._id, patch);
    await transitionToDocumentationInProgressIfNeeded(ctx, negotiation, now);

    const refreshedNegotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);
    await transitionToReadyForClosureIfNeeded(ctx, refreshedNegotiation, now);

    const latestNegotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);
    return await buildChecklistStatus(ctx, latestNegotiation);
  },
});

export const waiveItem = mutation({
  args: {
    negotiation_id: v.id("negotiations"),
    item_key: manualChecklistItemKeyValidator,
    waive_reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    const waiveReason = normalizeRequiredString(args.waive_reason, "waive_reason");

    const negotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);
    ensureChecklistEditable(negotiation);

    if (args.item_key === "rent_agreement_status") {
      throw new Error("Rent agreement cannot be waived — it is a mandatory document.");
    }

    const now = Date.now();
    const itemConfig = MANUAL_CHECKLIST_CONFIG[args.item_key];

    const patch: ChecklistPatch = {
      last_activity_at: now,
    };

    patch[itemConfig.statusField] = NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED;
    patch[itemConfig.waiveReasonField] = waiveReason;

    await ctx.db.patch(negotiation._id, patch);
    await transitionToDocumentationInProgressIfNeeded(ctx, negotiation, now);

    const refreshedNegotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);
    await transitionToReadyForClosureIfNeeded(ctx, refreshedNegotiation, now);

    const latestNegotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);
    return await buildChecklistStatus(ctx, latestNegotiation);
  },
});

export const reopenChecklist = mutation({
  args: {
    negotiation_id: v.id("negotiations"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_MANAGE);

    const reason = args.reason.trim();
    if (reason.length < 5) {
      throw new Error("reason must be at least 5 characters");
    }

    const negotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);

    if (negotiation.status !== NEGOTIATION_STATUS.READY_FOR_CLOSURE) {
      throw new Error("Checklist can only be reopened from READY_FOR_CLOSURE");
    }

    if (
      !validateNegotiationTransition(
        negotiation.status,
        NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
      )
    ) {
      throw new Error(
        `Invalid negotiation status transition from ${negotiation.status} to DOCUMENTATION_IN_PROGRESS`,
      );
    }

    await ctx.db.patch(negotiation._id, {
      status: NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
      ready_for_closure_at: undefined,
      last_activity_at: Date.now(),
    });

    return { success: true };
  },
});

export const getChecklistStatus = query({
  args: {
    negotiation_id: v.id("negotiations"),
  },
  handler: async (ctx, args) => {
    await requireBackoffice(ctx);
    await requirePermission(ctx, PERMISSIONS.NEGOTIATIONS_VIEW);

    const negotiation = await getNegotiationOrThrow(ctx, args.negotiation_id);
    return await buildChecklistStatus(ctx, negotiation);
  },
});
