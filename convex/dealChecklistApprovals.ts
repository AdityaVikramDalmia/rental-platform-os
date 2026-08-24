import { v } from "convex/values";
import { requireAuth, requireBackoffice, requirePermission } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";

type DealChecklistDoc = Doc<"deal_checklists">;
type DealChecklistItem = DealChecklistDoc["items"][number];
type ChecklistApproval = DealChecklistItem["tenant_approval"];
type ApprovalStatus = DealChecklistItem["tenant_approval"]["status"];
type ChecklistStatus = DealChecklistDoc["status"];
type ItemOverallStatus = DealChecklistItem["overall_status"];
type ChecklistPartyRole = "TENANT" | "OWNER";
type ReadWriteCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

const DEAL_CHECKLIST_MANAGE_PERMISSION = "deal_checklists.manage";
const DEAL_CHECKLIST_VIEW_PERMISSION = "deal_checklists.view";
const REVIEWABLE_STATUSES: ReadonlySet<ChecklistStatus> = new Set(["SHARED", "IN_REVIEW"]);
const DISPUTABLE_STATUSES: readonly ChecklistStatus[] = ["DISPUTED"];
const PARTY_VISIBLE_STATUSES: readonly string[] = ["SHARED", "IN_REVIEW", "DISPUTED", "APPROVED"];
const SUPERSEDED_ERROR = "Checklist has been updated — please review the new version.";

function deriveOverallStatus(
  tenantStatus: ApprovalStatus,
  ownerStatus: ApprovalStatus,
): ItemOverallStatus {
  if (tenantStatus === "AGREED" && ownerStatus === "AGREED") {
    return "RESOLVED";
  }

  if (tenantStatus === "DISAGREED" || ownerStatus === "DISAGREED") {
    return "DISPUTED";
  }

  if (tenantStatus === "COMMENTED" || ownerStatus === "COMMENTED") {
    return "NEEDS_DISCUSSION";
  }

  return "UNREVIEWED";
}

function normalizeComment(comment: string | undefined): string | undefined {
  const normalized = comment?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function makeRedactedApproval(): ChecklistApproval {
  return {
    status: "PENDING",
    responded_at: undefined,
    comment: undefined,
  };
}

async function hasDualSignOff(
  ctx: ReadWriteCtx,
  checklistId: Id<"deal_checklists">,
): Promise<boolean> {
  const signatures = await ctx.db
    .query("deal_checklist_signatures")
    .withIndex("by_checklist_id", (q) => q.eq("checklist_id", checklistId))
    .collect();

  const hasTenantSignature = signatures.some((signature) => signature.signer_role === "TENANT");
  const hasOwnerSignature = signatures.some((signature) => signature.signer_role === "OWNER");
  return hasTenantSignature && hasOwnerSignature;
}

/** Deterministic JSON stringifier with sorted keys for SHA-256 hashing. */
function canonicalStringify(obj: unknown): string {
  if (obj === undefined) {
    return "null";
  }

  if (obj === null) {
    return "null";
  }

  if (typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalStringify).join(",")}]`;
  }

  const entries = Object.entries(obj as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return `{${entries
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${JSON.stringify(key)}:${canonicalStringify(value)}`)
    .join(",")}}`;
}

async function resolvePartyRole(
  ctx: ReadWriteCtx,
  checklist: DealChecklistDoc,
  userId: Id<"users">,
): Promise<ChecklistPartyRole> {
  const channel = await ctx.db.get(checklist.channel_id);
  if (!channel) {
    throw new Error("Chat channel not found");
  }

  if (channel.inquiry_id.toString() !== checklist.inquiry_id.toString()) {
    throw new Error("Checklist channel and inquiry mismatch");
  }

  const inquiry = await ctx.db.get(channel.inquiry_id);
  if (!inquiry) {
    throw new Error("Tenant inquiry not found");
  }

  if (inquiry.tenant_id?.toString() === userId.toString()) {
    return "TENANT";
  }

  const listing = await ctx.db.get(inquiry.listing_id);
  if (listing?.owner_id) {
    const owner = await ctx.db.get(listing.owner_id);
    if (owner?.user_id?.toString() === userId.toString()) {
      return "OWNER";
    }
  }

  throw new Error("Not authorized for this checklist");
}

async function hasBackofficePermission(
  ctx: ReadWriteCtx,
  user: Doc<"users">,
  permission: string,
): Promise<boolean> {
  if ((user.user_type !== "ADMIN" && user.user_type !== "OPS") || user.status !== "ACTIVE") {
    return false;
  }

  const assignments = await ctx.db
    .query("user_role_assignments")
    .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
    .filter((q) => q.neq(q.field("is_deleted"), true))
    .collect();

  const roles = await Promise.all(assignments.map((assignment) => ctx.db.get(assignment.role_id)));

  for (const role of roles) {
    if (!role || role.is_deleted) {
      continue;
    }

    if (role.permissions.includes(permission)) {
      return true;
    }
  }

  return false;
}

/**
 * Records a tenant/owner response for a single checklist item and recomputes derived statuses.
 */
export const respondToItem = mutation({
  args: {
    checklist_id: v.id("deal_checklists"),
    item_id: v.string(),
    response: v.union(v.literal("AGREED"), v.literal("DISAGREED"), v.literal("COMMENTED")),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const checklist = await ctx.db.get(args.checklist_id);
    if (!checklist) {
      throw new Error("Deal checklist not found");
    }

    if (checklist.status === "SUPERSEDED") {
      throw new Error(SUPERSEDED_ERROR);
    }

    if (!REVIEWABLE_STATUSES.has(checklist.status)) {
      throw new Error(
        `Cannot respond to checklist in status ${checklist.status} — must be SHARED or IN_REVIEW`,
      );
    }

    const role = await resolvePartyRole(ctx, checklist, user._id);

    const existingItem = checklist.items.find((item) => item.item_id === args.item_id);
    if (!existingItem) {
      throw new Error("Checklist item not found");
    }

    const currentApproval =
      role === "TENANT" ? existingItem.tenant_approval : existingItem.owner_approval;
    if (currentApproval.status !== "PENDING") {
      throw new Error("You have already responded to this checklist item");
    }

    const now = Date.now();
    const normalizedComment = normalizeComment(args.comment);

    const updatedItems = checklist.items.map((item) => {
      if (item.item_id !== args.item_id) {
        return item;
      }

      const tenantApproval =
        role === "TENANT"
          ? {
              status: args.response,
              responded_at: now,
              comment: normalizedComment,
            }
          : item.tenant_approval;

      const ownerApproval =
        role === "OWNER"
          ? {
              status: args.response,
              responded_at: now,
              comment: normalizedComment,
            }
          : item.owner_approval;

      return {
        ...item,
        tenant_approval: tenantApproval,
        owner_approval: ownerApproval,
        overall_status: deriveOverallStatus(tenantApproval.status, ownerApproval.status),
      };
    });

    if (checklist.status === "SHARED") {
      const hasDisputedItems = updatedItems.some((item) => item.overall_status === "DISPUTED");

      await ctx.db.patch(args.checklist_id, {
        items: updatedItems,
        status: hasDisputedItems ? "DISPUTED" : "IN_REVIEW",
      });
      return await ctx.db.get(args.checklist_id);
    }

    const hasDisputedItems = updatedItems.some((item) => item.overall_status === "DISPUTED");

    let nextChecklistStatus: ChecklistStatus = checklist.status;
    if (checklist.status === "IN_REVIEW" && hasDisputedItems) {
      nextChecklistStatus = "DISPUTED";
    }

    const patchPayload: {
      items: DealChecklistItem[];
      status?: ChecklistStatus;
    } = {
      items: updatedItems,
    };

    if (nextChecklistStatus !== checklist.status) {
      patchPayload.status = nextChecklistStatus;
    }

    await ctx.db.patch(args.checklist_id, patchPayload);
    return await ctx.db.get(args.checklist_id);
  },
});

/** Sign off on the deal checklist. Requires all items AGREED by the signing party. */
export const signOff = mutation({
  args: {
    checklist_id: v.id("deal_checklists"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const checklist = await ctx.db.get(args.checklist_id);
    if (!checklist) {
      throw new Error("Deal checklist not found");
    }

    if (checklist.status !== "IN_REVIEW") {
      throw new Error(`Cannot sign checklist in status ${checklist.status} - must be IN_REVIEW`);
    }

    const role = await resolvePartyRole(ctx, checklist, user._id);

    const hasItemsPendingAnyPartyAgreement = checklist.items.some(
      (item) => item.tenant_approval.status !== "AGREED" || item.owner_approval.status !== "AGREED",
    );

    if (hasItemsPendingAnyPartyAgreement) {
      throw new Error("All items must be agreed by both parties before signing");
    }

    const unagreedItems = checklist.items.filter((item) => {
      const approval = role === "TENANT" ? item.tenant_approval : item.owner_approval;
      return approval.status !== "AGREED";
    });

    if (unagreedItems.length > 0) {
      throw new Error(`Cannot sign - ${unagreedItems.length} item(s) not yet agreed by you`);
    }

    const existingSignature = await ctx.db
      .query("deal_checklist_signatures")
      .withIndex("by_signer", (q) =>
        q.eq("signer_user_id", user._id).eq("checklist_id", args.checklist_id),
      )
      .first();

    if (existingSignature) {
      throw new Error("Already signed. Signature can only be updated after a dispute is resolved.");
    }

    const signingPayload = checklist.items
      .slice()
      .sort((a, b) => a.item_id.localeCompare(b.item_id))
      .map((item) => ({
        item_id: item.item_id,
        description: item.description,
        resolved_value: item.admin_edited_value ?? item.extracted_value,
      }));

    const canonicalJson = canonicalStringify(signingPayload);
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalJson);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const signatureId = await ctx.db.insert("deal_checklist_signatures", {
      checklist_id: args.checklist_id,
      signer_user_id: user._id,
      signer_role: role,
      signature_hash: hashHex,
      signed_at: Date.now(),
    });

    // Race condition check: if both parties sign simultaneously, both inserts succeed.
    // Query for all signatures by this user on this checklist. If >1, delete our insert.
    const signaturesForUser = await ctx.db
      .query("deal_checklist_signatures")
      .withIndex("by_signer", (q) =>
        q.eq("signer_user_id", user._id).eq("checklist_id", args.checklist_id),
      )
      .collect();

    if (signaturesForUser.length > 1) {
      await ctx.db.delete(signatureId);
      throw new Error("Signature already exists. Another request may have signed simultaneously.");
    }

    const allSignatures = await ctx.db
      .query("deal_checklist_signatures")
      .withIndex("by_checklist_id", (q) => q.eq("checklist_id", args.checklist_id))
      .collect();

    const hasTenantSignature = allSignatures.some(
      (signature) => signature.signer_role === "TENANT",
    );
    const hasOwnerSignature = allSignatures.some((signature) => signature.signer_role === "OWNER");

    if (hasTenantSignature && hasOwnerSignature) {
      await ctx.db.patch(args.checklist_id, {
        status: "APPROVED",
        approved_at: Date.now(),
      });
    }

    return await ctx.db.get(signatureId);
  },
});

/**
 * Lets admins resolve a disputed item, reset both party approvals, and recompute checklist status.
 */
export const resolveDispute = mutation({
  args: {
    checklist_id: v.id("deal_checklists"),
    item_id: v.string(),
    resolved_value: v.string(),
    resolution_notes: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, DEAL_CHECKLIST_MANAGE_PERMISSION);

    const checklist = await ctx.db.get(args.checklist_id);
    if (!checklist) {
      throw new Error("Deal checklist not found");
    }

    if (!DISPUTABLE_STATUSES.includes(checklist.status)) {
      throw new Error(`Cannot resolve dispute on checklist with status ${checklist.status}`);
    }

    const resolvedValue = args.resolved_value.trim();
    if (resolvedValue.length === 0) {
      throw new Error("resolved_value is required");
    }

    const resolutionNotes = args.resolution_notes.trim();
    if (resolutionNotes.length === 0) {
      throw new Error("resolution_notes is required");
    }

    const targetItem = checklist.items.find((item) => item.item_id === args.item_id);
    if (!targetItem) {
      throw new Error("Checklist item not found");
    }

    if (targetItem.overall_status !== "DISPUTED") {
      throw new Error(
        `Item "${targetItem.description}" is not disputed and cannot be resolved through this endpoint`,
      );
    }

    const updatedItems = checklist.items.map((item) => {
      if (item.item_id !== args.item_id) {
        return item;
      }

      return {
        ...item,
        admin_edited_value: resolvedValue,
        tenant_approval: {
          status: "PENDING" as const,
          responded_at: undefined,
          comment: resolutionNotes,
        },
        owner_approval: {
          status: "PENDING" as const,
          responded_at: undefined,
          comment: resolutionNotes,
        },
        overall_status: "UNREVIEWED" as const,
      };
    });

    const hasDisputedItems = updatedItems.some((item) => item.overall_status === "DISPUTED");

    let nextChecklistStatus: ChecklistStatus = checklist.status;
    if (checklist.status === "DISPUTED" && !hasDisputedItems) {
      nextChecklistStatus = "IN_REVIEW";
    }

    const patchPayload: {
      items: DealChecklistItem[];
      status?: ChecklistStatus;
    } = {
      items: updatedItems,
    };

    if (nextChecklistStatus !== checklist.status) {
      patchPayload.status = nextChecklistStatus;
    }

    const existingSignatures = await ctx.db
      .query("deal_checklist_signatures")
      .withIndex("by_checklist_id", (q) => q.eq("checklist_id", checklist._id))
      .collect();

    for (const signature of existingSignatures) {
      await ctx.db.delete(signature._id);
    }

    await ctx.db.patch(args.checklist_id, patchPayload);
    return await ctx.db.get(args.checklist_id);
  },
});

/**
 * Returns a checklist for tenant/owner participants with role-aware approval helpers.
 */
export const getChecklistForParty = query({
  args: {
    checklist_id: v.id("deal_checklists"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const checklist = await ctx.db.get(args.checklist_id);
    if (!checklist) {
      return null;
    }

    let isBackofficeViewer = false;
    if (user.user_type === "ADMIN" || user.user_type === "OPS") {
      isBackofficeViewer = await hasBackofficePermission(ctx, user, DEAL_CHECKLIST_VIEW_PERMISSION);
    }

    if (!isBackofficeViewer && !PARTY_VISIBLE_STATUSES.includes(checklist.status)) {
      throw new Error("Checklist not available");
    }

    if (isBackofficeViewer) {
      return {
        ...checklist,
        current_party_role: user.user_type,
        items: checklist.items,
      };
    }

    const role = await resolvePartyRole(ctx, checklist, user._id);
    const dualSignOffComplete = await hasDualSignOff(ctx, checklist._id);

    const items = checklist.items.map((item) => {
      const myApproval = role === "TENANT" ? item.tenant_approval : item.owner_approval;

      if (dualSignOffComplete) {
        return {
          ...item,
          my_approval: myApproval,
        };
      }

      if (role === "TENANT") {
        return {
          ...item,
          owner_approval: makeRedactedApproval(),
          my_approval: myApproval,
        };
      }

      return {
        ...item,
        tenant_approval: makeRedactedApproval(),
        my_approval: myApproval,
      };
    });

    return {
      ...checklist,
      current_party_role: role,
      items,
    };
  },
});

/** Get all signatures for a checklist (for receipt rendering). */
export const getSignatures = query({
  args: {
    checklist_id: v.id("deal_checklists"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const checklist = await ctx.db.get(args.checklist_id);
    if (!checklist) {
      return [];
    }

    let isBackoffice = false;
    try {
      const backofficeUser = await requireBackoffice(ctx);
      isBackoffice = await hasBackofficePermission(
        ctx,
        backofficeUser,
        DEAL_CHECKLIST_VIEW_PERMISSION,
      );
    } catch {
      isBackoffice = false;
    }

    if (!isBackoffice) {
      try {
        await resolvePartyRole(ctx, checklist, user._id);
      } catch {
        throw new Error("Not authorized to view signatures");
      }
    }

    return await ctx.db
      .query("deal_checklist_signatures")
      .withIndex("by_checklist_id", (q) => q.eq("checklist_id", args.checklist_id))
      .collect();
  },
});
