import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  AVAILABILITY_TYPE,
  BUILDING_STATUS,
  FURNISHING,
  LEAD_STATUS,
  LISTING_STATUS,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  OWNER_LIFECYCLE_STAGE,
  PERMISSIONS,
  QUALITY_FLAGS,
  SLA_POLICIES,
  SOCIETY_STATUS,
  SYSTEM_CONFIG_KEYS,
  VISIT_STATUS,
} from "../lib/constants";
import { getStartOfDayIST } from "../lib/dates";
import { normalizePhone } from "../lib/validators";
import { requireFieldWorker, requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";
import { getGuardQualityFlags } from "./guards";
import {
  getOrCreateByPhoneInternal,
  incrementLeadCount,
  progressLifecycleStage,
  updateLastActivity,
} from "./owners";
import { rateLimiter } from "./rateLimiter";
import { getSystemConfigNumber } from "./systemConfig.helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
// TODO(P11): Read de-dup windows from system_config.
const FLAT_DUPLICATE_WINDOW_MS = 90 * DAY_MS;
const PHONE_DUPLICATE_WINDOW_MS = 30 * DAY_MS;
let nowProvider: () => number = () => Date.now();

type LeadPatch = Partial<Omit<Doc<"leads">, "_id" | "_creationTime">>;
type LeadQualityFlag = (typeof QUALITY_FLAGS)[keyof typeof QUALITY_FLAGS];
type LeadNoteEntry = NonNullable<Doc<"leads">["notes_thread"]>[number];
type LeadPriorityTier = "HIGH" | "MEDIUM" | "LOW";

const adminLeadStatusValidator = v.union(
  v.literal(LEAD_STATUS.SUBMITTED),
  v.literal(LEAD_STATUS.NEED_INFO),
  v.literal(LEAD_STATUS.POTENTIAL_DUPLICATE),
  v.literal(LEAD_STATUS.VERIFIED),
  v.literal(LEAD_STATUS.REJECTED),
  v.literal(LEAD_STATUS.DUPLICATE),
);

const qualityFlagValidator = v.union(
  v.literal(QUALITY_FLAGS.DUPLICATE_FLAT_MATCH),
  v.literal(QUALITY_FLAGS.DUPLICATE_PHONE_MATCH),
  v.literal(QUALITY_FLAGS.GUARD_HIGH_REJECTION),
  v.literal(QUALITY_FLAGS.OFF_SHIFT_SUBMISSION),
);

type DuplicateCheckResult = {
  isDuplicate: boolean;
  duplicateFlags: LeadQualityFlag[];
  duplicateOfId?: Id<"leads">;
};

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export const __setNowOverrideForTests = internalMutation({
  args: {
    now_ms: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    if (args.now_ms === undefined) {
      nowProvider = () => Date.now();
    } else {
      const nowMs = args.now_ms;
      nowProvider = () => nowMs;
    }

    return null;
  },
});

export const __insertLeadForTests = internalMutation({
  args: {
    society_id: v.id("societies"),
    building_id: v.id("buildings"),
    submitted_by_guard_id: v.id("users"),
    status: v.optional(adminLeadStatusValidator),
    floor_number: v.optional(v.string()),
    flat_number: v.optional(v.string()),
    owner_name: v.optional(v.string()),
    owner_phone: v.optional(v.string()),
    notes_thread: v.optional(
      v.array(
        v.object({
          note: v.string(),
          author_id: v.id("users"),
          author_name: v.string(),
          author_type: v.union(v.literal("ADMIN"), v.literal("GUARD")),
          timestamp: v.number(),
        }),
      ),
    ),
    quality_flags: v.optional(v.array(qualityFlagValidator)),
    duplicate_of_lead_id: v.optional(v.id("leads")),
    prospective_bounty: v.optional(v.number()),
    searchable_text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("leads", {
      society_id: args.society_id,
      building_id: args.building_id,
      floor_number: args.floor_number ?? "12",
      flat_number: args.flat_number ?? "1201",
      owner_name: args.owner_name,
      owner_phone: args.owner_phone ?? "9876543210",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      owner_consent_to_call: true,
      submitted_by_guard_id: args.submitted_by_guard_id,
      status: args.status ?? LEAD_STATUS.SUBMITTED,
      notes_thread: args.notes_thread,
      quality_flags: args.quality_flags,
      duplicate_of_lead_id: args.duplicate_of_lead_id,
      prospective_bounty: args.prospective_bounty,
      searchable_text: args.searchable_text,
    });
  },
});

export function validateLeadTransition(currentStatus: string, newStatus: string): boolean {
  const validTransitions: Record<string, string[]> = {
    [LEAD_STATUS.SUBMITTED]: [LEAD_STATUS.NEED_INFO, LEAD_STATUS.VERIFIED, LEAD_STATUS.REJECTED],
    [LEAD_STATUS.NEED_INFO]: [LEAD_STATUS.SUBMITTED, LEAD_STATUS.REJECTED],
    [LEAD_STATUS.POTENTIAL_DUPLICATE]: [LEAD_STATUS.DUPLICATE, LEAD_STATUS.SUBMITTED],
    [LEAD_STATUS.VERIFIED]: [LEAD_STATUS.REJECTED],
  };

  return (validTransitions[currentStatus] ?? []).includes(newStatus);
}

async function checkDuplicates(
  ctx: MutationCtx,
  societyId: Id<"societies">,
  buildingId: Id<"buildings">,
  flatNumber: string,
  ownerPhone: string,
): Promise<DuplicateCheckResult> {
  const now = nowProvider();
  const duplicateFlags: LeadQualityFlag[] = [];
  const normalizedFlatNumber = flatNumber.toUpperCase();

  const flatMatch = await ctx.db
    .query("leads")
    .withIndex("by_society_building_flat", (q) =>
      q
        .eq("society_id", societyId)
        .eq("building_id", buildingId)
        .eq("flat_number", normalizedFlatNumber),
    )
    .filter((q) =>
      q.and(
        q.neq(q.field("status"), LEAD_STATUS.REJECTED),
        q.neq(q.field("status"), LEAD_STATUS.DUPLICATE),
        q.gt(q.field("_creationTime"), now - FLAT_DUPLICATE_WINDOW_MS),
      ),
    )
    .order("desc")
    .first();

  if (flatMatch) {
    duplicateFlags.push(QUALITY_FLAGS.DUPLICATE_FLAT_MATCH);
  }

  const phoneMatch = await ctx.db
    .query("leads")
    .withIndex("by_owner_phone", (q) => q.eq("owner_phone", ownerPhone))
    .filter((q) =>
      q.and(
        q.eq(q.field("society_id"), societyId),
        q.neq(q.field("status"), LEAD_STATUS.REJECTED),
        q.neq(q.field("status"), LEAD_STATUS.DUPLICATE),
        q.gt(q.field("_creationTime"), now - PHONE_DUPLICATE_WINDOW_MS),
      ),
    )
    .order("desc")
    .first();

  if (phoneMatch) {
    duplicateFlags.push(QUALITY_FLAGS.DUPLICATE_PHONE_MATCH);
  }

  return {
    isDuplicate: duplicateFlags.length > 0,
    duplicateFlags,
    duplicateOfId: flatMatch?._id ?? phoneMatch?._id,
  };
}

async function buildSearchableText(
  ctx: MutationCtx | QueryCtx,
  societyId: Id<"societies">,
  buildingId: Id<"buildings">,
  flatNumber: string,
  ownerName: string | undefined,
  ownerPhone: string,
  guardName: string | undefined,
): Promise<string> {
  const [society, building] = await Promise.all([ctx.db.get(societyId), ctx.db.get(buildingId)]);

  return [society?.name, building?.name, flatNumber.toUpperCase(), ownerName, ownerPhone, guardName]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join(" ")
    .toLowerCase();
}

function createAdminNote(admin: Doc<"users">, note: string): LeadNoteEntry {
  return {
    note,
    author_id: admin._id,
    author_name: admin.name,
    author_type: "ADMIN",
    timestamp: nowProvider(),
  };
}

function isActionableForPriority(status: Doc<"leads">["status"]): boolean {
  return status === LEAD_STATUS.SUBMITTED || status === LEAD_STATUS.NEED_INFO;
}

function computeLeadPriority(
  lead: Doc<"leads">,
  guardVerifiedRate: number,
  verificationAttemptCount: number,
): { score: number; tier: LeadPriorityTier } {
  const ageFactor = Math.min(
    40,
    ((Date.now() - lead._creationTime) / SLA_POLICIES.lead.windowMs) * 40,
  );
  const rentFactor = Math.min(20, ((lead.rent_expected ?? 0) / 10000000) * 20);
  const duplicatePenalty =
    (lead.quality_flags ?? []).includes(QUALITY_FLAGS.DUPLICATE_FLAT_MATCH) ||
    (lead.quality_flags ?? []).includes(QUALITY_FLAGS.DUPLICATE_PHONE_MATCH)
      ? -10
      : 0;
  const guardQualityFactor = Math.round(Math.max(0, Math.min(1, guardVerifiedRate)) * 15);
  const verificationAttemptPenalty = Math.max(-15, verificationAttemptCount * -5);
  const rawScore =
    ageFactor + rentFactor + duplicatePenalty + guardQualityFactor + verificationAttemptPenalty;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  if (score >= 70) {
    return { score, tier: "HIGH" };
  }

  if (score >= 40) {
    return { score, tier: "MEDIUM" };
  }

  return { score, tier: "LOW" };
}

async function enrichLeadForAdminList(
  ctx: QueryCtx,
  lead: Doc<"leads">,
  guardVerifiedRate: number,
  verificationAttemptCount: number,
) {
  const [guard, building, society] = await Promise.all([
    ctx.db.get(lead.submitted_by_guard_id),
    ctx.db.get(lead.building_id),
    ctx.db.get(lead.society_id),
  ]);

  const priority = isActionableForPriority(lead.status)
    ? computeLeadPriority(lead, guardVerifiedRate, verificationAttemptCount)
    : { score: 0, tier: "LOW" as const };

  return {
    ...lead,
    guard_name: guard?.name,
    building_name: building?.name,
    society_name: society?.name,
    priority_score: priority.score,
    priority_tier: priority.tier,
  };
}

async function getGuardVerifiedRateByGuardId(
  ctx: QueryCtx,
  leads: Doc<"leads">[],
): Promise<Map<Id<"users">, number>> {
  const uniqueGuardIds = Array.from(new Set(leads.map((lead) => lead.submitted_by_guard_id)));

  const entries = await Promise.all(
    uniqueGuardIds.map(async (guardId) => {
      const guardLeads = await ctx.db
        .query("leads")
        .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", guardId))
        .collect();

      const verifiedCount = guardLeads.filter(
        (item) => item.status === LEAD_STATUS.VERIFIED,
      ).length;
      const guardVerifiedRate = guardLeads.length === 0 ? 0 : verifiedCount / guardLeads.length;

      return [guardId, guardVerifiedRate] as const;
    }),
  );

  return new Map(entries);
}

async function getVerificationAttemptCountByLeadId(
  ctx: QueryCtx,
  leads: Doc<"leads">[],
): Promise<Map<Id<"leads">, number>> {
  const entries = await Promise.all(
    leads.map(async (lead) => {
      const attempts = await ctx.db
        .query("owner_verifications")
        .withIndex("by_lead_id", (q) => q.eq("lead_id", lead._id))
        .collect();

      return [lead._id, attempts.length] as const;
    }),
  );

  return new Map(entries);
}

async function enrichLeadsForAdminList(ctx: QueryCtx, leads: Doc<"leads">[]) {
  const [guardVerifiedRatesByGuardId, verificationAttemptsByLeadId] = await Promise.all([
    getGuardVerifiedRateByGuardId(ctx, leads),
    getVerificationAttemptCountByLeadId(ctx, leads),
  ]);

  return await Promise.all(
    leads.map(async (lead) => {
      const guardVerifiedRate = guardVerifiedRatesByGuardId.get(lead.submitted_by_guard_id) ?? 0;
      const verificationAttemptCount = verificationAttemptsByLeadId.get(lead._id) ?? 0;

      return await enrichLeadForAdminList(ctx, lead, guardVerifiedRate, verificationAttemptCount);
    }),
  );
}

export const create = mutation({
  args: {
    building_id: v.id("buildings"),
    floor_number: v.string(),
    flat_number: v.string(),
    owner_phone: v.string(),
    availability_type: v.union(
      v.literal(AVAILABILITY_TYPE.VACANT_NOW),
      v.literal(AVAILABILITY_TYPE.VACANT_FROM),
    ),
    owner_consent_to_call: v.boolean(),
    availability_date: v.optional(v.number()),
    owner_name: v.optional(v.string()),
    rent_expected: v.optional(v.number()),
    furnishing: v.optional(
      v.union(
        v.literal(FURNISHING.UNFURNISHED),
        v.literal(FURNISHING.SEMI_FURNISHED),
        v.literal(FURNISHING.FULLY_FURNISHED),
      ),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user: guard, guardProfile } = await requireFieldWorker(ctx);

    if (!args.owner_consent_to_call) {
      throw new Error("Owner consent is required to submit this lead.");
    }

    const society = await ctx.db.get(guardProfile.society_id);

    if (!society) {
      throw new Error("Society not found");
    }

    if (society.status !== SOCIETY_STATUS.ACTIVE) {
      throw new Error("Cannot submit leads for an inactive society.");
    }

    const building = await ctx.db.get(args.building_id);

    if (!building || building.is_deleted) {
      throw new Error("Building not found");
    }

    if (building.society_id !== guardProfile.society_id) {
      throw new Error("Building does not belong to your society.");
    }

    if (building.status !== BUILDING_STATUS.ACTIVE) {
      throw new Error("Cannot submit leads for an inactive building.");
    }

    if (
      args.availability_type === AVAILABILITY_TYPE.VACANT_FROM &&
      args.availability_date === undefined
    ) {
      throw new Error("Availability date is required when type is VACANT_FROM");
    }

    if (args.rent_expected !== undefined && !Number.isInteger(args.rent_expected)) {
      throw new Error("Rent must be a whole number in paise.");
    }

    if (args.rent_expected !== undefined && args.rent_expected < 0) {
      throw new Error("Rent must be non-negative.");
    }

    const dailyLeadLimit = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY,
      5,
    );

    const startOfDayIST = getStartOfDayIST(nowProvider());
    const todaysLeads = await ctx.db
      .query("leads")
      .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", guard._id))
      .filter((q) => q.gte(q.field("_creationTime"), startOfDayIST))
      .collect();

    if (todaysLeads.length >= dailyLeadLimit) {
      throw new Error("Daily lead limit reached");
    }

    await rateLimiter.limit(ctx, "guard:lead_submission", {
      key: `${guard._id}`,
      throws: true,
    });

    const normalizedOwnerPhone = normalizePhone(args.owner_phone);
    const flatNumber = args.flat_number.trim().toUpperCase();
    const floorNumber = args.floor_number.trim();
    const ownerName = normalizeOptionalString(args.owner_name);
    const notes = normalizeOptionalString(args.notes);

    const { ownerId, wasCreated } = await getOrCreateByPhoneInternal(
      ctx,
      normalizedOwnerPhone,
      ownerName,
      "GUARD_LEAD",
    );

    const { isDuplicate, duplicateFlags, duplicateOfId } = await checkDuplicates(
      ctx,
      guardProfile.society_id,
      args.building_id,
      flatNumber,
      normalizedOwnerPhone,
    );

    const guardQualityFlags = await getGuardQualityFlags(ctx, guard._id);
    const qualityFlags: LeadQualityFlag[] = [...duplicateFlags];

    for (const guardQualityFlag of guardQualityFlags) {
      if (!qualityFlags.includes(guardQualityFlag)) {
        qualityFlags.push(guardQualityFlag);
      }
    }

    const searchableText = await buildSearchableText(
      ctx,
      guardProfile.society_id,
      args.building_id,
      flatNumber,
      ownerName,
      normalizedOwnerPhone,
      guard.name,
    );

    const leadId = await ctx.db.insert("leads", {
      society_id: guardProfile.society_id,
      building_id: args.building_id,
      floor_number: floorNumber,
      flat_number: flatNumber,
      owner_name: ownerName,
      owner_phone: normalizedOwnerPhone,
      owner_id: ownerId,
      availability_type: args.availability_type,
      availability_date: args.availability_date,
      rent_expected: args.rent_expected,
      furnishing: args.furnishing,
      notes,
      owner_consent_to_call: args.owner_consent_to_call,
      submitted_by_guard_id: guard._id,
      status: isDuplicate ? LEAD_STATUS.POTENTIAL_DUPLICATE : LEAD_STATUS.SUBMITTED,
      quality_flags: qualityFlags.length > 0 ? qualityFlags : undefined,
      duplicate_of_lead_id: duplicateOfId,
      searchable_text: searchableText,
    });

    if (wasCreated) {
      await ctx.db.patch(ownerId, {
        first_lead_id: leadId,
        updated_at: Date.now(),
      });
    }

    await incrementLeadCount(ctx, ownerId);
    await updateLastActivity(ctx, ownerId);

    // Reactivate dormant owner if new lead activity occurs
    const owner = await ctx.db.get(ownerId);
    if (owner && !owner.is_deleted && owner.lifecycle_stage === OWNER_LIFECYCLE_STAGE.DORMANT) {
      await progressLifecycleStage(ctx, ownerId, OWNER_LIFECYCLE_STAGE.ACTIVE);
    }

    return leadId;
  },
});

export const updateByGuard = mutation({
  args: {
    lead_id: v.id("leads"),
    owner_phone: v.optional(v.string()),
    owner_name: v.optional(v.string()),
    notes: v.optional(v.string()),
    furnishing: v.optional(
      v.union(
        v.literal(FURNISHING.UNFURNISHED),
        v.literal(FURNISHING.SEMI_FURNISHED),
        v.literal(FURNISHING.FULLY_FURNISHED),
      ),
    ),
    rent_expected: v.optional(v.number()),
    availability_type: v.optional(
      v.union(v.literal(AVAILABILITY_TYPE.VACANT_NOW), v.literal(AVAILABILITY_TYPE.VACANT_FROM)),
    ),
    availability_date: v.optional(v.number()),
    reply_note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user: guard } = await requireFieldWorker(ctx);
    const lead = await ctx.db.get(args.lead_id);

    if (!lead) {
      throw new Error("Lead not found");
    }

    if (lead.submitted_by_guard_id !== guard._id) {
      throw new Error("You can only update your own leads.");
    }

    if (
      lead.status !== LEAD_STATUS.NEED_INFO ||
      !validateLeadTransition(lead.status, LEAD_STATUS.SUBMITTED)
    ) {
      throw new Error("Lead can only be updated when status is NEED_INFO.");
    }

    const patch: LeadPatch = {};
    const changedFields: string[] = [];
    const hasOwnerNameInArgs = Object.prototype.hasOwnProperty.call(args, "owner_name");
    let ownerResolution: {
      oldOwnerId: Id<"owners"> | undefined;
      newOwnerId: Id<"owners">;
      wasCreated: boolean;
    } | null = null;

    if (hasOwnerNameInArgs) {
      patch.owner_name = normalizeOptionalString(args.owner_name);
      changedFields.push("owner_name");
    }

    if (args.owner_phone !== undefined) {
      const normalizedOwnerPhone = normalizePhone(args.owner_phone);
      patch.owner_phone = normalizedOwnerPhone;
      changedFields.push("owner_phone");

      if (normalizedOwnerPhone !== lead.owner_phone) {
        const ownerNameForResolution = hasOwnerNameInArgs ? patch.owner_name : lead.owner_name;
        const { ownerId: newOwnerId, wasCreated } = await getOrCreateByPhoneInternal(
          ctx,
          normalizedOwnerPhone,
          ownerNameForResolution,
          "GUARD_LEAD",
        );

        patch.owner_id = newOwnerId;
        ownerResolution = {
          oldOwnerId: lead.owner_id,
          newOwnerId,
          wasCreated,
        };
      }
    }

    if (args.notes !== undefined) {
      patch.notes = normalizeOptionalString(args.notes);
      changedFields.push("notes");
    }

    if (args.furnishing !== undefined) {
      patch.furnishing = args.furnishing;
      changedFields.push("furnishing");
    }

    if (args.rent_expected !== undefined) {
      if (!Number.isInteger(args.rent_expected)) {
        throw new Error("Rent must be a whole number in paise.");
      }

      if (args.rent_expected < 0) {
        throw new Error("Rent must be non-negative.");
      }

      patch.rent_expected = args.rent_expected;
      changedFields.push("rent_expected");
    }

    if (args.availability_type !== undefined) {
      patch.availability_type = args.availability_type;
      changedFields.push("availability_type");
    }

    if (args.availability_date !== undefined) {
      patch.availability_date = args.availability_date;
      changedFields.push("availability_date");
    }

    const nextAvailabilityType = patch.availability_type ?? lead.availability_type;
    const nextAvailabilityDate = patch.availability_date ?? lead.availability_date;

    if (
      nextAvailabilityType === AVAILABILITY_TYPE.VACANT_FROM &&
      nextAvailabilityDate === undefined
    ) {
      throw new Error("Availability date is required when type is VACANT_FROM");
    }

    const notesThread = [...(lead.notes_thread ?? [])];
    const normalizedReplyNote = normalizeOptionalString(args.reply_note);
    const authorType = guard.user_type === "OPS" ? "OPS" : "GUARD";
    const noteText =
      normalizedReplyNote ??
      (changedFields.length > 0
        ? `Updated fields: ${changedFields.join(", ")}`
        : "Updated lead details and resubmitted.");

    notesThread.push({
      note: noteText,
      author_id: guard._id,
      author_name: guard.name,
      author_type: authorType,
      timestamp: nowProvider(),
    });

    patch.notes_thread = notesThread;
    patch.status = LEAD_STATUS.SUBMITTED;

    await ctx.db.patch(args.lead_id, patch);

    if (ownerResolution && ownerResolution.oldOwnerId !== ownerResolution.newOwnerId) {
      const now = nowProvider();

      if (ownerResolution.wasCreated) {
        await ctx.db.patch(ownerResolution.newOwnerId, {
          first_lead_id: args.lead_id,
          updated_at: now,
        });
      }

      if (ownerResolution.oldOwnerId) {
        const oldOwner = await ctx.db.get(ownerResolution.oldOwnerId);
        if (oldOwner && !oldOwner.is_deleted) {
          await ctx.db.patch(ownerResolution.oldOwnerId, {
            total_leads_count: Math.max(0, oldOwner.total_leads_count - 1),
            last_activity_at: now,
            updated_at: now,
          });
        }
      }

      const newOwner = await ctx.db.get(ownerResolution.newOwnerId);
      if (newOwner && !newOwner.is_deleted) {
        await ctx.db.patch(ownerResolution.newOwnerId, {
          total_leads_count: newOwner.total_leads_count + 1,
          last_activity_at: now,
          updated_at: now,
        });
      }
    }

    return await ctx.db.get(args.lead_id);
  },
});

export const requestInfo = mutation({
  args: {
    lead_id: v.id("leads"),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.LEADS_REQUEST_INFO);
    const lead = await ctx.db.get(args.lead_id);

    if (!lead) {
      throw new Error("Lead not found");
    }

    if (!validateLeadTransition(lead.status, LEAD_STATUS.NEED_INFO)) {
      throw new Error(`Cannot request info on a lead with status: ${lead.status}`);
    }

    const updatedThread = [...(lead.notes_thread ?? []), createAdminNote(admin, args.note)];

    await ctx.db.patch(args.lead_id, {
      status: LEAD_STATUS.NEED_INFO,
      notes_thread: updatedThread,
    });

    return await ctx.db.get(args.lead_id);
  },
});

export const reject = mutation({
  args: {
    lead_id: v.id("leads"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.LEADS_REJECT);
    const lead = await ctx.db.get(args.lead_id);

    if (!lead) {
      throw new Error("Lead not found");
    }

    if (!validateLeadTransition(lead.status, LEAD_STATUS.REJECTED)) {
      throw new Error(`Cannot reject a lead with status: ${lead.status}`);
    }

    const updatedThread = [
      ...(lead.notes_thread ?? []),
      createAdminNote(admin, `Rejected: ${args.reason}`),
    ];

    // P06: Archive linked listing when verified lead is rejected
    const linkedListing = await ctx.db
      .query("listings")
      .withIndex("by_lead_id", (q) => q.eq("lead_id", args.lead_id))
      .first();

    if (linkedListing && linkedListing.status === LISTING_STATUS.PUBLISHED) {
      await ctx.db.patch(linkedListing._id, { status: LISTING_STATUS.ARCHIVED });

      if (linkedListing.owner_id) {
        const owner = await ctx.db.get(linkedListing.owner_id);
        if (owner && !owner.is_deleted) {
          const now = nowProvider();
          await ctx.db.patch(linkedListing.owner_id, {
            active_properties_count: Math.max(0, owner.active_properties_count - 1),
            last_activity_at: now,
            updated_at: now,
          });
        }
      }
    }

    const inProgressVisits = await ctx.db
      .query("visits")
      .withIndex("by_lead_id", (q) => q.eq("lead_id", args.lead_id))
      .filter((q) => q.eq(q.field("status"), VISIT_STATUS.IN_PROGRESS))
      .collect();

    if (inProgressVisits.length > 0) {
      throw new Error("Cannot reject lead while a linked visit is IN_PROGRESS.");
    }

    const pendingVisits = await ctx.db
      .query("visits")
      .withIndex("by_lead_id", (q) => q.eq("lead_id", args.lead_id))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), VISIT_STATUS.ASSIGNED),
          q.eq(q.field("status"), VISIT_STATUS.CONFIRMED),
        ),
      )
      .collect();

    await Promise.all(
      pendingVisits.map(async (visit) => {
        await ctx.db.patch(visit._id, {
          status: VISIT_STATUS.CANCELLED,
          outcome_notes: "Lead rejected",
        });
      }),
    );

    await ctx.db.patch(args.lead_id, {
      status: LEAD_STATUS.REJECTED,
      notes_thread: updatedThread,
    });

    const building = await ctx.db.get(lead.building_id);

    if (!SKIP_SCHEDULER_SIDE_EFFECTS_IN_TESTS) {
      try {
        await ctx.scheduler.runAfter(0, internal.notifications.emitEvent, {
          user_id: lead.submitted_by_guard_id,
          event_type: "lead_rejected",
          category: NOTIFICATION_CATEGORY.LEAD_UPDATE,
          severity: NOTIFICATION_SEVERITY.IMPORTANT,
          payload: {
            flat_number: lead.flat_number,
            building_name: building?.name ?? "Unknown building",
            reason: args.reason,
          },
          dedup_key: `lead:${args.lead_id}:rejected`,
          action_url: "/guard/leads",
        });
      } catch (error) {
        console.error("Failed to enqueue lead rejected notification (non-blocking):", error);
      }
    }

    return await ctx.db.get(args.lead_id);
  },
});

export const markDuplicate = mutation({
  args: {
    lead_id: v.id("leads"),
    original_lead_id: v.id("leads"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.LEADS_MARK_DUPLICATE);
    const lead = await ctx.db.get(args.lead_id);

    if (!lead) {
      throw new Error("Lead not found");
    }

    if (!validateLeadTransition(lead.status, LEAD_STATUS.DUPLICATE)) {
      throw new Error("Can only mark POTENTIAL_DUPLICATE leads as duplicate.");
    }

    if (args.lead_id === args.original_lead_id) {
      throw new Error("A lead cannot be marked as a duplicate of itself.");
    }

    const originalLead = await ctx.db.get(args.original_lead_id);

    if (!originalLead) {
      throw new Error("Original lead not found.");
    }

    if (originalLead.society_id !== lead.society_id) {
      throw new Error("Original lead must be from the same society.");
    }

    const duplicateReason = normalizeOptionalString(args.reason);
    const patch: LeadPatch = {
      status: LEAD_STATUS.DUPLICATE,
      duplicate_of_lead_id: args.original_lead_id,
    };

    if (duplicateReason) {
      patch.notes_thread = [
        ...(lead.notes_thread ?? []),
        createAdminNote(admin, `Marked duplicate: ${duplicateReason}`),
      ];
    }

    await ctx.db.patch(args.lead_id, patch);

    return await ctx.db.get(args.lead_id);
  },
});

export const clearDuplicateFlag = mutation({
  args: {
    lead_id: v.id("leads"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LEADS_MARK_DUPLICATE);
    const lead = await ctx.db.get(args.lead_id);

    if (!lead) {
      throw new Error("Lead not found");
    }

    if (!validateLeadTransition(lead.status, LEAD_STATUS.SUBMITTED)) {
      throw new Error("Can only clear duplicate flag on POTENTIAL_DUPLICATE leads.");
    }

    const remainingFlags = (lead.quality_flags ?? []).filter(
      (flag) =>
        flag !== QUALITY_FLAGS.DUPLICATE_FLAT_MATCH && flag !== QUALITY_FLAGS.DUPLICATE_PHONE_MATCH,
    );

    await ctx.db.patch(args.lead_id, {
      status: LEAD_STATUS.SUBMITTED,
      quality_flags: remainingFlags.length > 0 ? remainingFlags : undefined,
      duplicate_of_lead_id: undefined,
    });

    return await ctx.db.get(args.lead_id);
  },
});

export const setBounty = mutation({
  args: {
    lead_id: v.id("leads"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LEADS_SET_BOUNTY);
    const lead = await ctx.db.get(args.lead_id);

    if (!lead) {
      throw new Error("Lead not found");
    }

    if (lead.status === LEAD_STATUS.REJECTED || lead.status === LEAD_STATUS.DUPLICATE) {
      throw new Error("Cannot set bounty on a terminated lead.");
    }

    if (args.amount <= 0 || !Number.isInteger(args.amount)) {
      throw new Error("Bounty amount must be a positive whole number in paise.");
    }

    await ctx.db.patch(args.lead_id, {
      prospective_bounty: args.amount,
    });

    return await ctx.db.get(args.lead_id);
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(adminLeadStatusValidator),
    society_id: v.optional(v.id("societies")),
    building_id: v.optional(v.id("buildings")),
    guard_user_id: v.optional(v.id("users")),
    quality_flag: v.optional(qualityFlagValidator),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LEADS_VIEW);

    const searchText = normalizeOptionalString(args.search);

    if (searchText) {
      const searchResults = await ctx.db
        .query("leads")
        .withSearchIndex("search_leads", (q) => {
          let sq = q.search("searchable_text", searchText);

          if (args.status) {
            sq = sq.eq("status", args.status);
          }

          if (args.society_id) {
            sq = sq.eq("society_id", args.society_id);
          }

          return sq;
        })
        .take(50);

      const filteredResults = searchResults.filter((lead) => {
        if (args.building_id && lead.building_id !== args.building_id) {
          return false;
        }

        if (args.guard_user_id && lead.submitted_by_guard_id !== args.guard_user_id) {
          return false;
        }

        if (args.quality_flag && !(lead.quality_flags ?? []).includes(args.quality_flag)) {
          return false;
        }

        return true;
      });

      const enrichedLeads = await enrichLeadsForAdminList(ctx, filteredResults);

      return {
        page: enrichedLeads,
        isDone: true,
        continueCursor: "",
      } as PaginationResult<(typeof enrichedLeads)[number]>;
    }

    let paginatedResults: PaginationResult<Doc<"leads">>;

    if (args.status && args.society_id) {
      let leadsQuery = ctx.db
        .query("leads")
        .withIndex("by_society_and_status", (q) =>
          q.eq("society_id", args.society_id as Id<"societies">).eq("status", args.status!),
        );

      if (args.building_id) {
        leadsQuery = leadsQuery.filter((q) => q.eq(q.field("building_id"), args.building_id));
      }

      if (args.guard_user_id) {
        leadsQuery = leadsQuery.filter((q) =>
          q.eq(q.field("submitted_by_guard_id"), args.guard_user_id),
        );
      }

      paginatedResults = await leadsQuery.order("desc").paginate(args.paginationOpts);
    } else if (args.status) {
      let leadsQuery = ctx.db
        .query("leads")
        .withIndex("by_status", (q) => q.eq("status", args.status!));

      if (args.building_id) {
        leadsQuery = leadsQuery.filter((q) => q.eq(q.field("building_id"), args.building_id));
      }

      if (args.guard_user_id) {
        leadsQuery = leadsQuery.filter((q) =>
          q.eq(q.field("submitted_by_guard_id"), args.guard_user_id),
        );
      }

      paginatedResults = await leadsQuery.order("desc").paginate(args.paginationOpts);
    } else if (args.society_id) {
      let leadsQuery = ctx.db
        .query("leads")
        .withIndex("by_society_id", (q) => q.eq("society_id", args.society_id as Id<"societies">));

      if (args.building_id) {
        leadsQuery = leadsQuery.filter((q) => q.eq(q.field("building_id"), args.building_id));
      }

      if (args.guard_user_id) {
        leadsQuery = leadsQuery.filter((q) =>
          q.eq(q.field("submitted_by_guard_id"), args.guard_user_id),
        );
      }

      paginatedResults = await leadsQuery.order("desc").paginate(args.paginationOpts);
    } else {
      let leadsQuery = ctx.db.query("leads");

      if (args.building_id) {
        leadsQuery = leadsQuery.filter((q) => q.eq(q.field("building_id"), args.building_id));
      }

      if (args.guard_user_id) {
        leadsQuery = leadsQuery.filter((q) =>
          q.eq(q.field("submitted_by_guard_id"), args.guard_user_id),
        );
      }

      paginatedResults = await leadsQuery.order("desc").paginate(args.paginationOpts);
    }

    const qualityFlag = args.quality_flag;
    const filteredPage = qualityFlag
      ? paginatedResults.page.filter((lead) => (lead.quality_flags ?? []).includes(qualityFlag))
      : paginatedResults.page;

    const enrichedLeads = await enrichLeadsForAdminList(ctx, filteredPage);

    return {
      ...paginatedResults,
      page: enrichedLeads,
    } as PaginationResult<(typeof enrichedLeads)[number]>;
  },
});

export const getById = query({
  args: {
    lead_id: v.id("leads"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LEADS_VIEW);

    const lead = await ctx.db.get(args.lead_id);

    if (!lead) {
      throw new Error("Lead not found");
    }

    const [guardUser, guardProfile, building, society, duplicateLead, verifications] =
      await Promise.all([
        ctx.db.get(lead.submitted_by_guard_id),
        ctx.db
          .query("guard_profiles")
          .withIndex("by_user_id", (q) => q.eq("user_id", lead.submitted_by_guard_id))
          .unique(),
        ctx.db.get(lead.building_id),
        ctx.db.get(lead.society_id),
        lead.duplicate_of_lead_id ? ctx.db.get(lead.duplicate_of_lead_id) : Promise.resolve(null),
        ctx.db
          .query("owner_verifications")
          .withIndex("by_lead_id", (q) => q.eq("lead_id", args.lead_id))
          .collect(),
      ]);

    return {
      ...lead,
      guard: guardUser
        ? {
            user_id: guardUser._id,
            name: guardUser.name,
            email: guardUser.email,
            phone: guardUser.phone,
            guard_type: guardProfile?.guard_type,
            society_id: guardProfile?.society_id,
          }
        : null,
      building: building
        ? {
            building_id: building._id,
            name: building.name,
            total_floors: building.total_floors,
          }
        : null,
      society: society
        ? {
            society_id: society._id,
            name: society.name,
            city: society.city,
          }
        : null,
      duplicate_lead: duplicateLead
        ? {
            lead_id: duplicateLead._id,
            flat_number: duplicateLead.flat_number,
            status: duplicateLead.status,
            created_at: duplicateLead._creationTime,
          }
        : null,
      verifications,
    };
  },
});

export const getStatusCounts = query({
  args: {
    society_id: v.optional(v.id("societies")),
    quality_flag: v.optional(qualityFlagValidator),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.LEADS_VIEW);

    const searchText = normalizeOptionalString(args.search);

    let leads: Doc<"leads">[];

    if (searchText) {
      const searchResults = await ctx.db
        .query("leads")
        .withSearchIndex("search_leads", (q) => {
          let sq = q.search("searchable_text", searchText);

          if (args.society_id) {
            sq = sq.eq("society_id", args.society_id);
          }

          return sq;
        })
        .take(50);

      leads = searchResults;
    } else {
      leads = args.society_id
        ? await ctx.db
            .query("leads")
            .withIndex("by_society_id", (q) =>
              q.eq("society_id", args.society_id as Id<"societies">),
            )
            .collect()
        : await ctx.db.query("leads").collect();
    }

    const qualityFlag = args.quality_flag;
    if (qualityFlag) {
      leads = leads.filter((lead) => (lead.quality_flags ?? []).includes(qualityFlag));
    }

    const counts: Record<string, number> = {
      [LEAD_STATUS.SUBMITTED]: 0,
      [LEAD_STATUS.NEED_INFO]: 0,
      [LEAD_STATUS.POTENTIAL_DUPLICATE]: 0,
      [LEAD_STATUS.VERIFIED]: 0,
      [LEAD_STATUS.REJECTED]: 0,
      [LEAD_STATUS.DUPLICATE]: 0,
    };

    for (const lead of leads) {
      counts[lead.status] = (counts[lead.status] ?? 0) + 1;
    }

    return counts;
  },
});

export const getMyLeads = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status_filter: v.optional(
      v.union(
        v.literal("ALL"),
        v.literal("IN_REVIEW"),
        v.literal("VERIFIED"),
        v.literal("REJECTED"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { user: guard } = await requireFieldWorker(ctx);

    let leadsQuery = ctx.db
      .query("leads")
      .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", guard._id));

    if (args.status_filter === "IN_REVIEW") {
      leadsQuery = leadsQuery.filter((q) =>
        q.or(
          q.eq(q.field("status"), LEAD_STATUS.SUBMITTED),
          q.eq(q.field("status"), LEAD_STATUS.NEED_INFO),
          q.eq(q.field("status"), LEAD_STATUS.POTENTIAL_DUPLICATE),
        ),
      );
    }

    if (args.status_filter === "VERIFIED") {
      leadsQuery = leadsQuery.filter((q) => q.eq(q.field("status"), LEAD_STATUS.VERIFIED));
    }

    if (args.status_filter === "REJECTED") {
      leadsQuery = leadsQuery.filter((q) =>
        q.or(
          q.eq(q.field("status"), LEAD_STATUS.REJECTED),
          q.eq(q.field("status"), LEAD_STATUS.DUPLICATE),
        ),
      );
    }

    const paginatedResults = await leadsQuery.order("desc").paginate(args.paginationOpts);

    const enrichedLeads = await Promise.all(
      paginatedResults.page.map(async (lead) => {
        const [building, society] = await Promise.all([
          ctx.db.get(lead.building_id),
          ctx.db.get(lead.society_id),
        ]);

        return {
          ...lead,
          building_name: building?.name,
          society_name: society?.name,
        };
      }),
    );

    return {
      ...paginatedResults,
      page: enrichedLeads,
    } as PaginationResult<(typeof enrichedLeads)[number]>;
  },
});

export const getMyLeadById = query({
  args: {
    lead_id: v.id("leads"),
  },
  handler: async (ctx, args) => {
    const { user: guard } = await requireFieldWorker(ctx);
    const lead = await ctx.db.get(args.lead_id);

    if (!lead || lead.submitted_by_guard_id !== guard._id) {
      throw new Error("Lead not found");
    }

    const [building, society] = await Promise.all([
      ctx.db.get(lead.building_id),
      ctx.db.get(lead.society_id),
    ]);

    return {
      ...lead,
      building_name: building?.name,
      society_name: society?.name,
      notes_thread: lead.notes_thread ?? [],
    };
  },
});

export const getSubmissionCount = query({
  args: {},
  handler: async (ctx) => {
    const { user: guard } = await requireFieldWorker(ctx);
    const todayMidnightIST = getStartOfDayIST(nowProvider());

    const todaysLeads = await ctx.db
      .query("leads")
      .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", guard._id))
      .filter((q) => q.gte(q.field("_creationTime"), todayMidnightIST))
      .collect();

    const dailyLeadLimit = await getSystemConfigNumber(
      ctx,
      SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY,
      5,
    );

    return {
      count: todaysLeads.length,
      limit: dailyLeadLimit,
    };
  },
});
const SKIP_SCHEDULER_SIDE_EFFECTS_IN_TESTS =
  process.env.VITEST === "true" || process.env.CONVEX_DISABLE_SCHEDULER_SIDE_EFFECTS === "1";
