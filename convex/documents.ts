import { v } from "convex/values";
import {
  DOCUMENT_ITEM_STATUS,
  DOCUMENT_OVERALL_STATUS,
  DOCUMENT_REQUIREMENT_TYPE,
  PERMISSIONS,
  USER_TYPE,
  type DocumentItemStatus,
  type DocumentOverallStatus,
} from "../lib/constants";
import { requireAuth, requireOwner, requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";

const documentRequirementTypeValidator = v.union(
  v.literal(DOCUMENT_REQUIREMENT_TYPE.OWNER_DOCS),
  v.literal(DOCUMENT_REQUIREMENT_TYPE.TENANT_DOCS),
  v.literal(DOCUMENT_REQUIREMENT_TYPE.SOCIETY_DOCS),
);

const requirementItemInputValidator = v.object({
  item_id: v.string(),
  label: v.string(),
  description: v.optional(v.string()),
  is_required: v.boolean(),
});

const VALID_DOC_ITEM_TRANSITIONS: Record<DocumentItemStatus, DocumentItemStatus[]> = {
  [DOCUMENT_ITEM_STATUS.PENDING]: [DOCUMENT_ITEM_STATUS.COLLECTED, DOCUMENT_ITEM_STATUS.NA],
  [DOCUMENT_ITEM_STATUS.COLLECTED]: [DOCUMENT_ITEM_STATUS.VERIFIED, DOCUMENT_ITEM_STATUS.REJECTED],
  [DOCUMENT_ITEM_STATUS.VERIFIED]: [],
  [DOCUMENT_ITEM_STATUS.REJECTED]: [DOCUMENT_ITEM_STATUS.COLLECTED],
  [DOCUMENT_ITEM_STATUS.NA]: [],
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

type AuthenticatedUser = Doc<"users">;
type RequirementDoc = Doc<"document_requirements">;
type RequirementItem = RequirementDoc["items"][number];
type ReadCtx = QueryCtx | MutationCtx;

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

function assertBackofficeUser(user: AuthenticatedUser): void {
  if (user.user_type !== USER_TYPE.ADMIN && user.user_type !== USER_TYPE.OPS) {
    throw new Error("Admin or OPS access required");
  }
}

function canReadRequirement(user: AuthenticatedUser, requirement: RequirementDoc): boolean {
  if (user.user_type === USER_TYPE.ADMIN || user.user_type === USER_TYPE.OPS) {
    return true;
  }

  return requirement.assigned_to === user._id;
}

function assertCanReadRequirement(user: AuthenticatedUser, requirement: RequirementDoc): void {
  if (!canReadRequirement(user, requirement)) {
    throw new Error("You do not have access to this requirement");
  }
}

function assertAssignedToUser(user: AuthenticatedUser, requirement: RequirementDoc): void {
  if (!requirement.assigned_to) {
    throw new Error("Document requirement is not assigned");
  }

  if (requirement.assigned_to !== user._id) {
    throw new Error("Only the assigned user can collect this document item");
  }
}

function assertValidTransition(from: DocumentItemStatus, to: DocumentItemStatus): void {
  const allowedTransitions = VALID_DOC_ITEM_TRANSITIONS[from] ?? [];

  if (!allowedTransitions.includes(to)) {
    throw new Error(`Invalid document item status transition: ${from} -> ${to}`);
  }
}

function computeOverallStatus(items: RequirementItem[]): DocumentOverallStatus {
  if (items.some((item) => item.status === DOCUMENT_ITEM_STATUS.REJECTED)) {
    return DOCUMENT_OVERALL_STATUS.BLOCKED;
  }

  const actionable = items.filter((item) => item.status !== DOCUMENT_ITEM_STATUS.NA);

  if (actionable.length === 0) {
    return DOCUMENT_OVERALL_STATUS.COMPLETE;
  }

  if (actionable.every((item) => item.status === DOCUMENT_ITEM_STATUS.VERIFIED)) {
    return DOCUMENT_OVERALL_STATUS.COMPLETE;
  }

  if (actionable.every((item) => item.status === DOCUMENT_ITEM_STATUS.PENDING)) {
    return DOCUMENT_OVERALL_STATUS.NOT_STARTED;
  }

  return DOCUMENT_OVERALL_STATUS.IN_PROGRESS;
}

function updateItem(
  requirement: RequirementDoc,
  itemId: string,
  updater: (item: RequirementItem) => RequirementItem,
): {
  items: RequirementDoc["items"];
  overallStatus: DocumentOverallStatus;
} {
  const normalizedItemId = normalizeRequiredString(itemId, "item_id");
  const itemIndex = requirement.items.findIndex((item) => item.item_id === normalizedItemId);

  if (itemIndex < 0) {
    throw new Error(`Document item not found: ${normalizedItemId}`);
  }

  const nextItems = [...requirement.items];
  nextItems[itemIndex] = updater(requirement.items[itemIndex]);

  return {
    items: nextItems,
    overallStatus: computeOverallStatus(nextItems),
  };
}

async function getRequirementOrThrow(
  ctx: ReadCtx,
  requirementId: Id<"document_requirements">,
): Promise<RequirementDoc> {
  const requirement = await ctx.db.get(requirementId);

  if (!requirement || requirement.is_deleted) {
    throw new Error("Document requirement not found");
  }

  return requirement;
}

async function getLatestOwnerForUser(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<Doc<"owners"> | null> {
  const owners = await ctx.db
    .query("owners")
    .withIndex("by_user_id", (q) => q.eq("user_id", userId))
    .filter((q) =>
      q.and(q.neq(q.field("is_deleted"), true), q.eq(q.field("merged_into_id"), undefined)),
    )
    .collect();

  if (owners.length === 0) {
    return null;
  }

  return owners.reduce((latest, candidate) => {
    if (candidate._creationTime > latest._creationTime) {
      return candidate;
    }

    if (candidate._creationTime === latest._creationTime) {
      return String(candidate._id) > String(latest._id) ? candidate : latest;
    }

    return latest;
  });
}

async function assertOwnerCanAccessRequirement(
  ctx: ReadCtx,
  ownerUserId: Id<"users">,
  requirement: RequirementDoc,
): Promise<Doc<"owners">> {
  const owner = await getLatestOwnerForUser(ctx, ownerUserId);

  if (!owner) {
    throw new Error("Owner profile not found");
  }

  const [lead, listing, closure] = await Promise.all([
    requirement.lead_id ? ctx.db.get(requirement.lead_id) : Promise.resolve(null),
    requirement.listing_id ? ctx.db.get(requirement.listing_id) : Promise.resolve(null),
    requirement.closure_id ? ctx.db.get(requirement.closure_id) : Promise.resolve(null),
  ]);

  const canAccess =
    lead?.owner_id === owner._id ||
    listing?.owner_id === owner._id ||
    closure?.owner_id === owner._id;

  if (!canAccess) {
    throw new Error("You do not have access to this requirement");
  }

  return owner;
}

async function validateUploadedDocument(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  fileType: string,
  fileSize: number,
): Promise<void> {
  const metadata = await ctx.db.system.get("_storage", storageId);

  if (!metadata) {
    throw new Error("Uploaded file not found in storage");
  }

  const contentType = metadata.contentType ?? "";

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error("Only JPEG, PNG, and PDF files are allowed");
  }

  if (metadata.size > MAX_FILE_SIZE_BYTES || fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error("File too large. Maximum size is 10MB");
  }

  const normalizedFileType = normalizeRequiredString(fileType, "file_type");

  if (contentType !== normalizedFileType) {
    throw new Error("file_type does not match uploaded file metadata");
  }

  if (metadata.size !== fileSize) {
    throw new Error("file_size does not match uploaded file metadata");
  }
}

export const createRequirementBundle = mutation({
  args: {
    lead_id: v.optional(v.id("leads")),
    listing_id: v.optional(v.id("listings")),
    closure_id: v.optional(v.id("closures")),
    requirement_type: documentRequirementTypeValidator,
    assigned_to: v.optional(v.id("users")),
    items: v.array(requirementItemInputValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, PERMISSIONS.CLOSURES_EDIT);

    if (!args.lead_id && !args.listing_id && !args.closure_id) {
      throw new Error("At least one context link is required: lead_id, listing_id, or closure_id");
    }

    if (args.items.length === 0) {
      throw new Error("At least one requirement item is required");
    }

    const [lead, listing, closure, assignee] = await Promise.all([
      args.lead_id ? ctx.db.get(args.lead_id) : Promise.resolve(null),
      args.listing_id ? ctx.db.get(args.listing_id) : Promise.resolve(null),
      args.closure_id ? ctx.db.get(args.closure_id) : Promise.resolve(null),
      args.assigned_to ? ctx.db.get(args.assigned_to) : Promise.resolve(null),
    ]);

    if (args.lead_id && !lead) {
      throw new Error("Lead not found");
    }

    if (args.listing_id && !listing) {
      throw new Error("Listing not found");
    }

    if (args.closure_id && !closure) {
      throw new Error("Closure not found");
    }

    if (args.assigned_to && !assignee) {
      throw new Error("Assigned user not found");
    }

    if (
      assignee &&
      assignee.user_type !== "ADMIN" &&
      assignee.user_type !== "OPS" &&
      assignee.user_type !== "GUARD"
    ) {
      throw new Error("Document requirements can only be assigned to admin, OPS, or guard users");
    }

    const seenItemIds = new Set<string>();
    const items: RequirementDoc["items"] = args.items.map((item) => {
      const itemId = normalizeRequiredString(item.item_id, "item_id");

      if (seenItemIds.has(itemId)) {
        throw new Error(`Duplicate item_id in requirement bundle: ${itemId}`);
      }

      seenItemIds.add(itemId);

      return {
        item_id: itemId,
        label: normalizeRequiredString(item.label, "label"),
        description: normalizeOptionalString(item.description),
        is_required: item.is_required,
        status: DOCUMENT_ITEM_STATUS.PENDING,
        storage_id: undefined,
        file_type: undefined,
        file_size: undefined,
        collected_at: undefined,
        collected_by: undefined,
        verified_at: undefined,
        verified_by: undefined,
        rejection_notes: undefined,
        notes: undefined,
      };
    });

    return await ctx.db.insert("document_requirements", {
      lead_id: args.lead_id,
      listing_id: args.listing_id,
      closure_id: args.closure_id,
      requirement_type: args.requirement_type,
      assigned_to: args.assigned_to,
      assigned_by: actor._id,
      overall_status: DOCUMENT_OVERALL_STATUS.NOT_STARTED,
      items,
      notes: normalizeOptionalString(args.notes),
      is_deleted: false,
    });
  },
});

export const collectItem = mutation({
  args: {
    requirement_id: v.id("document_requirements"),
    item_id: v.string(),
    storage_id: v.id("_storage"),
    file_type: v.string(),
    file_size: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    assertBackofficeUser(user);

    const requirement = await getRequirementOrThrow(ctx, args.requirement_id);
    assertAssignedToUser(user, requirement);

    await validateUploadedDocument(ctx, args.storage_id, args.file_type, args.file_size);

    const now = Date.now();
    const { items, overallStatus } = updateItem(requirement, args.item_id, (item) => {
      assertValidTransition(item.status, DOCUMENT_ITEM_STATUS.COLLECTED);

      return {
        ...item,
        status: DOCUMENT_ITEM_STATUS.COLLECTED,
        storage_id: args.storage_id,
        file_type: normalizeRequiredString(args.file_type, "file_type"),
        file_size: args.file_size,
        collected_at: now,
        collected_by: user._id,
        verified_at: undefined,
        verified_by: undefined,
        rejection_notes: undefined,
        notes: normalizeOptionalString(args.notes),
      };
    });

    await ctx.db.patch(requirement._id, {
      items,
      overall_status: overallStatus,
    });

    return await ctx.db.get(requirement._id);
  },
});

export const verifyItem = mutation({
  args: {
    requirement_id: v.id("document_requirements"),
    item_id: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reviewer = await requirePermission(ctx, PERMISSIONS.CLOSURES_EDIT);
    const requirement = await getRequirementOrThrow(ctx, args.requirement_id);

    const now = Date.now();
    const { items, overallStatus } = updateItem(requirement, args.item_id, (item) => {
      assertValidTransition(item.status, DOCUMENT_ITEM_STATUS.VERIFIED);

      return {
        ...item,
        status: DOCUMENT_ITEM_STATUS.VERIFIED,
        verified_at: now,
        verified_by: reviewer._id,
        rejection_notes: undefined,
        notes: args.notes !== undefined ? normalizeOptionalString(args.notes) : item.notes,
      };
    });

    await ctx.db.patch(requirement._id, {
      items,
      overall_status: overallStatus,
    });

    if (requirement.assigned_to) {
      await ctx.runMutation(internal.incentives.recomputeQualityScore, {
        guard_user_id: requirement.assigned_to,
        trigger: "DOCUMENTS_UPDATED",
      });
    }

    return await ctx.db.get(requirement._id);
  },
});

export const rejectItem = mutation({
  args: {
    requirement_id: v.id("document_requirements"),
    item_id: v.string(),
    rejection_notes: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_EDIT);
    const requirement = await getRequirementOrThrow(ctx, args.requirement_id);

    const rejectionNotes = normalizeRequiredString(args.rejection_notes, "rejection_notes");
    const { items, overallStatus } = updateItem(requirement, args.item_id, (item) => {
      assertValidTransition(item.status, DOCUMENT_ITEM_STATUS.REJECTED);

      return {
        ...item,
        status: DOCUMENT_ITEM_STATUS.REJECTED,
        verified_at: undefined,
        verified_by: undefined,
        rejection_notes: rejectionNotes,
      };
    });

    await ctx.db.patch(requirement._id, {
      items,
      overall_status: overallStatus,
    });

    if (requirement.assigned_to) {
      await ctx.runMutation(internal.incentives.recomputeQualityScore, {
        guard_user_id: requirement.assigned_to,
        trigger: "DOCUMENTS_UPDATED",
      });
    }

    return await ctx.db.get(requirement._id);
  },
});

export const markItemNA = mutation({
  args: {
    requirement_id: v.id("document_requirements"),
    item_id: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.CLOSURES_EDIT);
    const requirement = await getRequirementOrThrow(ctx, args.requirement_id);

    const { items, overallStatus } = updateItem(requirement, args.item_id, (item) => {
      assertValidTransition(item.status, DOCUMENT_ITEM_STATUS.NA);

      return {
        ...item,
        status: DOCUMENT_ITEM_STATUS.NA,
        storage_id: undefined,
        file_type: undefined,
        file_size: undefined,
        collected_at: undefined,
        collected_by: undefined,
        verified_at: undefined,
        verified_by: undefined,
        rejection_notes: undefined,
        notes: args.notes !== undefined ? normalizeOptionalString(args.notes) : item.notes,
      };
    });

    await ctx.db.patch(requirement._id, {
      items,
      overall_status: overallStatus,
    });

    if (requirement.assigned_to) {
      await ctx.runMutation(internal.incentives.recomputeQualityScore, {
        guard_user_id: requirement.assigned_to,
        trigger: "DOCUMENTS_UPDATED",
      });
    }

    return await ctx.db.get(requirement._id);
  },
});

export const updateNotes = mutation({
  args: {
    requirement_id: v.id("document_requirements"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const requirement = await getRequirementOrThrow(ctx, args.requirement_id);

    // The assignee may annotate their own requirement; anyone else needs the
    // same permission as the other requirement writes in this module.
    if (requirement.assigned_to !== user._id) {
      await requirePermission(ctx, PERMISSIONS.CLOSURES_EDIT);
    }

    await ctx.db.patch(requirement._id, {
      notes: normalizeOptionalString(args.notes),
    });

    return await ctx.db.get(requirement._id);
  },
});

export const generateUploadUrl = mutation({
  args: {
    requirement_id: v.id("document_requirements"),
    item_id: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    assertBackofficeUser(user);

    // Same participant rule as collectItem: only the assignee, only for an item
    // that can still move to COLLECTED.
    const requirement = await getRequirementOrThrow(ctx, args.requirement_id);
    assertAssignedToUser(user, requirement);

    const item = requirement.items.find((candidate) => candidate.item_id === args.item_id);
    if (!item) {
      throw new Error(`Document item not found: ${args.item_id}`);
    }

    assertValidTransition(item.status, DOCUMENT_ITEM_STATUS.COLLECTED);

    await rateLimiter.limit(ctx, "documents:upload_url_generation", {
      key: user._id,
      throws: true,
    });

    return await ctx.storage.generateUploadUrl();
  },
});

export const generateUploadUrlForOwner = mutation({
  args: {
    requirement_id: v.id("document_requirements"),
    item_id: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerUser = await requireOwner(ctx);
    const requirement = await getRequirementOrThrow(ctx, args.requirement_id);
    await assertOwnerCanAccessRequirement(ctx, ownerUser._id, requirement);

    const item = requirement.items.find((candidate) => candidate.item_id === args.item_id);
    if (!item) {
      throw new Error(`Document item not found: ${args.item_id}`);
    }

    if (
      item.status !== DOCUMENT_ITEM_STATUS.PENDING &&
      item.status !== DOCUMENT_ITEM_STATUS.REJECTED
    ) {
      throw new Error("Only pending or rejected document items can be uploaded");
    }

    return await ctx.storage.generateUploadUrl();
  },
});

export const collectItemForOwner = mutation({
  args: {
    requirement_id: v.id("document_requirements"),
    item_id: v.string(),
    storage_id: v.id("_storage"),
    file_type: v.string(),
    file_size: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerUser = await requireOwner(ctx);
    const requirement = await getRequirementOrThrow(ctx, args.requirement_id);
    await assertOwnerCanAccessRequirement(ctx, ownerUser._id, requirement);

    await validateUploadedDocument(ctx, args.storage_id, args.file_type, args.file_size);

    const now = Date.now();
    const { items, overallStatus } = updateItem(requirement, args.item_id, (item) => {
      assertValidTransition(item.status, DOCUMENT_ITEM_STATUS.COLLECTED);

      return {
        ...item,
        status: DOCUMENT_ITEM_STATUS.COLLECTED,
        storage_id: args.storage_id,
        file_type: normalizeRequiredString(args.file_type, "file_type"),
        file_size: args.file_size,
        collected_at: now,
        collected_by: ownerUser._id,
        verified_at: undefined,
        verified_by: undefined,
        rejection_notes: undefined,
        notes: normalizeOptionalString(args.notes),
      };
    });

    await ctx.db.patch(requirement._id, {
      items,
      overall_status: overallStatus,
    });

    return await ctx.db.get(requirement._id);
  },
});

export const getMyDocuments = query({
  args: {},
  handler: async (ctx) => {
    const ownerUser = await requireOwner(ctx);
    const owner = await getLatestOwnerForUser(ctx, ownerUser._id);

    if (!owner) {
      return { requirements: [] };
    }

    const [leads, listings, closures] = await Promise.all([
      ctx.db
        .query("leads")
        .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
        .collect(),
      ctx.db
        .query("listings")
        .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
        .collect(),
      ctx.db
        .query("closures")
        .withIndex("by_owner_id", (q) => q.eq("owner_id", owner._id))
        .collect(),
    ]);

    if (leads.length === 0 && listings.length === 0 && closures.length === 0) {
      return { requirements: [] };
    }

    const [requirementsByLead, requirementsByListing, requirementsByClosure] = await Promise.all([
      Promise.all(
        leads.map(
          async (lead) =>
            await ctx.db
              .query("document_requirements")
              .withIndex("by_lead_id", (q) => q.eq("lead_id", lead._id))
              .filter((q) => q.neq(q.field("is_deleted"), true))
              .collect(),
        ),
      ),
      Promise.all(
        listings.map(
          async (listing) =>
            await ctx.db
              .query("document_requirements")
              .withIndex("by_listing_id", (q) => q.eq("listing_id", listing._id))
              .filter((q) => q.neq(q.field("is_deleted"), true))
              .collect(),
        ),
      ),
      Promise.all(
        closures.map(
          async (closure) =>
            await ctx.db
              .query("document_requirements")
              .withIndex("by_closure_id", (q) => q.eq("closure_id", closure._id))
              .filter((q) => q.neq(q.field("is_deleted"), true))
              .collect(),
        ),
      ),
    ]);

    const requirementMap = new Map<Id<"document_requirements">, RequirementDoc>();

    for (const requirement of [
      ...requirementsByLead.flat(),
      ...requirementsByListing.flat(),
      ...requirementsByClosure.flat(),
    ]) {
      requirementMap.set(requirement._id, requirement);
    }

    if (requirementMap.size === 0) {
      return { requirements: [] };
    }

    const leadById = new Map(leads.map((lead) => [lead._id, lead]));
    const listingById = new Map(listings.map((listing) => [listing._id, listing]));
    const closureById = new Map(closures.map((closure) => [closure._id, closure]));

    const buildingIds = Array.from(new Set(leads.map((lead) => lead.building_id)));
    const societyIds = Array.from(new Set(leads.map((lead) => lead.society_id)));

    const [buildings, societies] = await Promise.all([
      Promise.all(buildingIds.map(async (id) => await ctx.db.get(id))),
      Promise.all(societyIds.map(async (id) => await ctx.db.get(id))),
    ]);

    const buildingNameById = new Map(
      buildingIds.map((id, index) => [id, buildings[index]?.name ?? null]),
    );
    const societyNameById = new Map(
      societyIds.map((id, index) => [id, societies[index]?.name ?? null]),
    );

    const requirements = Array.from(requirementMap.values())
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((requirement) => {
        const listing = requirement.listing_id ? listingById.get(requirement.listing_id) : null;
        const closure = requirement.closure_id ? closureById.get(requirement.closure_id) : null;

        const resolvedLeadId = requirement.lead_id ?? listing?.lead_id ?? closure?.lead_id;
        const lead = resolvedLeadId ? leadById.get(resolvedLeadId) : null;

        const buildingName = lead ? buildingNameById.get(lead.building_id) : null;
        const societyName = lead ? societyNameById.get(lead.society_id) : null;

        const propertyLabel = lead
          ? [
              societyName ?? "Property",
              buildingName ?? undefined,
              lead.flat_number ? `Flat ${lead.flat_number}` : undefined,
            ]
              .filter((value): value is string => Boolean(value && value.trim()))
              .join(" · ")
          : "Property context unavailable";

        return {
          _id: requirement._id,
          requirement_type: requirement.requirement_type,
          overall_status: requirement.overall_status,
          context: {
            lead_id: requirement.lead_id ?? null,
            listing_id: requirement.listing_id ?? null,
            closure_id: requirement.closure_id ?? null,
            property_label: propertyLabel,
          },
          items: requirement.items.map((item) => ({
            item_id: item.item_id,
            label: item.label,
            is_required: item.is_required,
            status: item.status,
            file_type: item.file_type ?? null,
            file_size: item.file_size ?? null,
            collected_at: item.collected_at ?? null,
            rejection_notes: item.rejection_notes ?? null,
          })),
        };
      });

    return { requirements };
  },
});

export const getByLeadId = query({
  args: {
    lead_id: v.id("leads"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const requirements = await ctx.db
      .query("document_requirements")
      .withIndex("by_lead_id", (q) => q.eq("lead_id", args.lead_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    return requirements.filter((requirement) => canReadRequirement(user, requirement));
  },
});

export const getByListingId = query({
  args: {
    listing_id: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const requirements = await ctx.db
      .query("document_requirements")
      .withIndex("by_listing_id", (q) => q.eq("listing_id", args.listing_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    return requirements.filter((requirement) => canReadRequirement(user, requirement));
  },
});

export const getByClosureId = query({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const requirements = await ctx.db
      .query("document_requirements")
      .withIndex("by_closure_id", (q) => q.eq("closure_id", args.closure_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    return requirements.filter((requirement) => canReadRequirement(user, requirement));
  },
});

export const getLinkedRegulatoryItems = query({
  args: {
    closure_id: v.id("closures"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const [requirements, regulatoryItems] = await Promise.all([
      ctx.db
        .query("document_requirements")
        .withIndex("by_closure_id", (q) => q.eq("closure_id", args.closure_id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
      ctx.db
        .query("regulatory_items")
        .withIndex("by_closure_id", (q) => q.eq("closure_id", args.closure_id))
        .filter((q) => q.neq(q.field("is_deleted"), true))
        .collect(),
    ]);

    const readableRequirements = requirements.filter((requirement) =>
      canReadRequirement(user, requirement),
    );
    const canViewAllRegulatoryItems =
      user.user_type === USER_TYPE.ADMIN || user.user_type === USER_TYPE.OPS;

    const readableRegulatoryItems = canViewAllRegulatoryItems
      ? regulatoryItems
      : regulatoryItems.filter((item) => item.assigned_to === user._id);

    return {
      document_requirements: readableRequirements,
      regulatory_items: readableRegulatoryItems,
    };
  },
});

export const getById = query({
  args: {
    requirement_id: v.id("document_requirements"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const requirement = await getRequirementOrThrow(ctx, args.requirement_id);
    assertCanReadRequirement(user, requirement);

    return requirement;
  },
});

export const listAssignedToMe = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    return await ctx.db
      .query("document_requirements")
      .withIndex("by_assigned_to", (q) => q.eq("assigned_to", user._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .order("desc")
      .collect();
  },
});
