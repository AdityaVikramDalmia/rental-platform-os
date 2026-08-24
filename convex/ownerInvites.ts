import { v } from "convex/values";
import { TENANT_INQUIRY_STATUS } from "../lib/constants";
import { addPersonaToUser, requireAuth, requirePermission } from "./auth.helpers";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";

const DAY_MS = 24 * 60 * 60 * 1000;

const TERMINAL_INQUIRY_STATUSES = new Set<string>([
  TENANT_INQUIRY_STATUS.REJECTED,
  TENANT_INQUIRY_STATUS.EXPIRED,
  TENANT_INQUIRY_STATUS.CLOSED,
  "CANCELLED",
]);

function normalizeOptionalEmail(email: string | undefined): string | undefined {
  if (email === undefined) {
    return undefined;
  }

  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function maskExpectedEmail(email: string | undefined): string | null {
  const normalizedEmail = normalizeOptionalEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const atIndex = normalizedEmail.indexOf("@");
  if (atIndex <= 0) {
    return `${normalizedEmail[0] ?? ""}***`;
  }

  return `${normalizedEmail[0]}***${normalizedEmail.slice(atIndex)}`;
}

async function getInviteExpiryDays(
  ctx: Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">,
): Promise<number> {
  const expiryConfig = await ctx.db
    .query("system_config")
    .withIndex("by_key", (q) => q.eq("key", "chat_owner_invite_expiry_days"))
    .first();

  const parsed = expiryConfig ? Number.parseInt(expiryConfig.value, 10) : 7;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 7;
}

async function resolveOwnerForInquiry(
  ctx: Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">,
  inquiry: Doc<"tenant_inquiries">,
): Promise<Doc<"owners"> | null> {
  const listing = await ctx.db.get(inquiry.listing_id);
  if (!listing) {
    return null;
  }

  if (listing.owner_id) {
    const ownerFromListing = await ctx.db.get(listing.owner_id);
    if (ownerFromListing && !ownerFromListing.is_deleted && !ownerFromListing.merged_into_id) {
      return ownerFromListing;
    }
  }

  const lead = await ctx.db.get(listing.lead_id);
  if (!lead) {
    return null;
  }

  if (lead.owner_id) {
    const ownerFromLead = await ctx.db.get(lead.owner_id);
    if (ownerFromLead && !ownerFromLead.is_deleted && !ownerFromLead.merged_into_id) {
      return ownerFromLead;
    }
  }

  const ownersByPhone = await ctx.db
    .query("owners")
    .withIndex("by_phone", (q) => q.eq("phone", lead.owner_phone))
    .filter((q) => q.eq(q.field("is_deleted"), false))
    .collect();

  const unmergedOwner = ownersByPhone.find((ownerCandidate) => !ownerCandidate.merged_into_id);
  if (unmergedOwner) {
    return unmergedOwner;
  }

  let mergedOwner = ownersByPhone[0] ?? null;
  const visitedOwnerIds = new Set<string>();

  while (mergedOwner?.merged_into_id) {
    const ownerId = mergedOwner._id.toString();
    if (visitedOwnerIds.has(ownerId)) {
      return null;
    }
    visitedOwnerIds.add(ownerId);

    const nextOwner = await ctx.db.get(mergedOwner.merged_into_id);
    if (!nextOwner || nextOwner.is_deleted) {
      return null;
    }

    mergedOwner = nextOwner;
  }

  if (mergedOwner && !mergedOwner.is_deleted && !mergedOwner.merged_into_id) {
    return mergedOwner;
  }

  return null;
}

async function hasBackofficePermission(
  ctx: Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">,
  user: Doc<"users">,
  permission: string,
): Promise<boolean> {
  if (
    (!(user.user_types?.includes("ADMIN") ?? user.user_type === "ADMIN") &&
      !(user.user_types?.includes("OPS") ?? user.user_type === "OPS")) ||
    user.status !== "ACTIVE"
  ) {
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

export const generateInvite = mutation({
  args: {
    inquiry_id: v.id("tenant_inquiries"),
    channel_id: v.id("chat_channels"),
    owner_expected_email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, "owner_invites.manage");

    const inquiry = await ctx.db.get(args.inquiry_id);
    if (!inquiry) {
      throw new Error("Inquiry not found");
    }

    const listing = await ctx.db.get(inquiry.listing_id);
    if (!listing) {
      throw new Error("Listing not found for this inquiry");
    }

    const channel = await ctx.db.get(args.channel_id);
    if (!channel) {
      throw new Error("Channel not found");
    }

    if (channel.inquiry_id !== args.inquiry_id) {
      throw new Error("Channel does not belong to this inquiry");
    }

    const now = Date.now();

    const existingPendingInvites = await ctx.db
      .query("owner_invites")
      .withIndex("by_inquiry_and_status", (q) =>
        q.eq("inquiry_id", args.inquiry_id).eq("status", "PENDING"),
      )
      .collect();

    let hasActivePendingInvite = false;
    for (const pendingInvite of existingPendingInvites) {
      if (pendingInvite.expires_at <= now) {
        await ctx.db.patch(pendingInvite._id, {
          status: "EXPIRED",
        });
        continue;
      }

      hasActivePendingInvite = true;
    }

    if (hasActivePendingInvite) {
      throw new Error("A pending owner invite already exists for this inquiry");
    }

    const expiryDays = await getInviteExpiryDays(ctx);
    const inviteId = await ctx.db.insert("owner_invites", {
      inquiry_id: args.inquiry_id,
      channel_id: args.channel_id,
      invite_token: crypto.randomUUID(),
      owner_expected_email: normalizeOptionalEmail(args.owner_expected_email),
      status: "PENDING",
      expires_at: now + expiryDays * DAY_MS,
      consumed_at: undefined,
      consumed_by_user_id: undefined,
      created_by_admin_id: admin._id,
      created_at: now,
    });

    const invite = await ctx.db.get(inviteId);
    if (!invite) {
      throw new Error("Failed to create owner invite");
    }

    return invite;
  },
});

export const consumeInvite = mutation({
  args: {
    invite_token: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (
      !(user.user_types?.includes("OWNER") ?? user.user_type === "OWNER") &&
      !(user.user_types?.includes("TENANT") ?? user.user_type === "TENANT")
    ) {
      throw new Error("Owner or tenant access required");
    }

    if (user.status !== "ACTIVE") {
      throw new Error("Account is not active");
    }

    await rateLimiter.limit(ctx, "consume_invite", {
      key: user._id,
      throws: true,
    });

    const invite = await ctx.db
      .query("owner_invites")
      .withIndex("by_token", (q) => q.eq("invite_token", args.invite_token))
      .first();

    if (!invite) {
      throw new Error("Invite not found");
    }

    if (invite.status !== "PENDING") {
      throw new Error("Invite is no longer valid");
    }

    const now = Date.now();
    if (invite.expires_at <= now) {
      throw new Error("Invite has expired");
    }

    const expectedEmail = normalizeOptionalEmail(invite.owner_expected_email);
    if (expectedEmail) {
      const userEmail = user.email?.trim().toLowerCase();

      if (!userEmail || userEmail !== expectedEmail) {
        throw new Error("Invite email does not match authenticated user");
      }
    }
    const identityVerified = expectedEmail !== undefined;

    const inquiry = await ctx.db.get(invite.inquiry_id);
    if (!inquiry) {
      throw new Error("Inquiry not found");
    }

    if (TERMINAL_INQUIRY_STATUSES.has(inquiry.status)) {
      throw new Error("Cannot consume invite — inquiry is no longer active");
    }

    const owner = await resolveOwnerForInquiry(ctx, inquiry);
    if (!owner) {
      throw new Error("Owner not found for inquiry");
    }
    const resolvedOwnerId = owner._id;

    const listing = await ctx.db.get(inquiry.listing_id);
    if (!listing) {
      throw new Error("Listing not found");
    }

    if (listing.owner_id !== resolvedOwnerId) {
      await ctx.db.patch(listing._id, { owner_id: resolvedOwnerId });
    }

    if (owner.user_id && owner.user_id.toString() !== user._id.toString()) {
      throw new Error("Owner account is already linked to a different user");
    }

    await ctx.db.patch(invite._id, {
      status: "CONSUMED",
      identity_verified: identityVerified,
      consumed_at: now,
      consumed_by_user_id: user._id,
    });

    await addPersonaToUser(ctx, user._id, "OWNER");

    if (!owner.user_id) {
      await ctx.db.patch(owner._id, {
        user_id: user._id,
        updated_at: now,
        last_activity_at: now,
      });
    }

    const joinMessage = identityVerified
      ? "Owner joined the conversation"
      : "Owner joined the conversation (identity not email-verified)";

    await ctx.db.insert("chat_messages", {
      channel_id: invite.channel_id,
      sender_user_id: user._id,
      sender_role: "SYSTEM",
      original_content: joinMessage,
      masked_content: joinMessage,
      status: "DELIVERED",
      admin_review_required: false,
      is_ai_processed: true,
      created_at: now,
      delivered_at: now,
    });

    return {
      success: true,
      channel_id: invite.channel_id,
      inquiry_id: invite.inquiry_id,
    };
  },
});

export const regenerateInvite = mutation({
  args: {
    invite_id: v.id("owner_invites"),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, "owner_invites.manage");

    const existingInvite = await ctx.db.get(args.invite_id);
    if (!existingInvite) {
      throw new Error("Invite not found");
    }

    if (existingInvite.status !== "PENDING" && existingInvite.status !== "EXPIRED") {
      throw new Error("Only pending or expired invites can be regenerated");
    }

    await ctx.db.patch(existingInvite._id, {
      status: "REGENERATED",
    });

    const existingPending = await ctx.db
      .query("owner_invites")
      .withIndex("by_inquiry_and_status", (q) =>
        q.eq("inquiry_id", existingInvite.inquiry_id).eq("status", "PENDING"),
      )
      .collect();

    for (const invite of existingPending) {
      await ctx.db.patch(invite._id, {
        status: "EXPIRED",
      });
    }

    const now = Date.now();
    const expiryDays = await getInviteExpiryDays(ctx);
    const newInviteId = await ctx.db.insert("owner_invites", {
      inquiry_id: existingInvite.inquiry_id,
      channel_id: existingInvite.channel_id,
      invite_token: crypto.randomUUID(),
      owner_expected_email: normalizeOptionalEmail(existingInvite.owner_expected_email),
      status: "PENDING",
      expires_at: now + expiryDays * DAY_MS,
      consumed_at: undefined,
      consumed_by_user_id: undefined,
      created_by_admin_id: admin._id,
      created_at: now,
    });

    const newInvite = await ctx.db.get(newInviteId);
    if (!newInvite) {
      throw new Error("Failed to regenerate owner invite");
    }

    return newInvite;
  },
});

export const getByToken = query({
  args: {
    invite_token: v.string(),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("owner_invites")
      .withIndex("by_token", (q) => q.eq("invite_token", args.invite_token))
      .first();

    if (!invite) {
      return null;
    }

    const identity = await ctx.auth.getUserIdentity();
    const user = identity ? await requireAuth(ctx) : null;

    const inquiry = await ctx.db.get(invite.inquiry_id);
    const listing = inquiry ? await ctx.db.get(inquiry.listing_id) : null;
    const lead = listing ? await ctx.db.get(listing.lead_id) : null;
    const building = lead ? await ctx.db.get(lead.building_id) : null;
    const society = lead ? await ctx.db.get(lead.society_id) : null;

    const now = Date.now();
    const effectiveStatus =
      invite.status === "PENDING" && invite.expires_at <= now ? "EXPIRED" : invite.status;

    const listingContext = listing
      ? {
          building_name: building?.name ?? null,
          society_name: society?.name ?? null,
          flat_number: lead?.flat_number ?? null,
          bhk_config: listing.bhk_config,
        }
      : null;
    const baseResponse = {
      status: effectiveStatus,
      expires_at: invite.expires_at,
      owner_expected_email: maskExpectedEmail(invite.owner_expected_email),
      listing_context: listingContext,
    };

    if (!user) {
      return baseResponse;
    }

    const hasBackofficeManageAccess = await hasBackofficePermission(
      ctx,
      user,
      "owner_invites.manage",
    );

    if (hasBackofficeManageAccess) {
      const owner = inquiry ? await resolveOwnerForInquiry(ctx, inquiry) : null;

      return {
        ...baseResponse,
        inquiry_id: invite.inquiry_id,
        channel_id: invite.channel_id,
        owner_id: owner?._id ?? listing?.owner_id ?? null,
        consumed_at: invite.consumed_at,
        consumed_by_user_id: invite.consumed_by_user_id,
        owner_expected_email: invite.owner_expected_email ?? null,
      };
    }

    const isConsumedByCaller =
      effectiveStatus === "CONSUMED" &&
      invite.consumed_by_user_id !== undefined &&
      invite.consumed_by_user_id.toString() === user._id.toString();

    if (isConsumedByCaller) {
      return {
        ...baseResponse,
        inquiry_id: invite.inquiry_id,
        channel_id: invite.channel_id,
        consumed_by_user_id: invite.consumed_by_user_id,
      };
    }

    return baseResponse;
  },
});

export const getForInquiry = query({
  args: {
    inquiry_id: v.id("tenant_inquiries"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "owner_invites.manage");

    const invites = await ctx.db
      .query("owner_invites")
      .withIndex("by_inquiry_id", (q) => q.eq("inquiry_id", args.inquiry_id))
      .collect();

    if (invites.length === 0) {
      return null;
    }

    return invites.sort((a, b) => b.created_at - a.created_at)[0];
  },
});

export const expireStaleInvites = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const staleInvites = await ctx.db
      .query("owner_invites")
      .withIndex("by_status_expires", (q) => q.eq("status", "PENDING").lt("expires_at", now))
      .collect();

    for (const invite of staleInvites) {
      await ctx.db.patch(invite._id, {
        status: "EXPIRED",
      });
    }

    return {
      expired_count: staleInvites.length,
    };
  },
});
