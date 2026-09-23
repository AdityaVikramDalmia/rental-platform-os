import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  PERMISSIONS,
  SUPPORT_INQUIRY_STATUS,
  USER_STATUS,
  USER_TYPE,
  type SupportInquiryStatus,
} from "../lib/constants";
import { normalizePhone } from "../lib/validators";
import { requirePermission } from "./auth.helpers";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";

const supportInquiryStatusValidator = v.union(
  v.literal(SUPPORT_INQUIRY_STATUS.OPEN),
  v.literal(SUPPORT_INQUIRY_STATUS.IN_PROGRESS),
  v.literal(SUPPORT_INQUIRY_STATUS.RESOLVED),
  v.literal(SUPPORT_INQUIRY_STATUS.CLOSED),
);

const supportInquiryPreferredContactMethodValidator = v.union(
  v.literal("EMAIL"),
  v.literal("PHONE"),
  v.literal("WHATSAPP"),
  v.literal("IN_APP"),
);

const supportInquiryPersonaTypeValidator = v.union(
  v.literal("TENANT"),
  v.literal("OWNER"),
  v.literal("GUARD"),
  v.literal("OTHER"),
);

const supportInquiryUpdateStatusValidator = v.union(
  v.literal(SUPPORT_INQUIRY_STATUS.IN_PROGRESS),
  v.literal(SUPPORT_INQUIRY_STATUS.RESOLVED),
  v.literal(SUPPORT_INQUIRY_STATUS.CLOSED),
);

const VALID_TRANSITIONS: Record<SupportInquiryStatus, SupportInquiryStatus[]> = {
  [SUPPORT_INQUIRY_STATUS.OPEN]: [
    SUPPORT_INQUIRY_STATUS.IN_PROGRESS,
    SUPPORT_INQUIRY_STATUS.RESOLVED,
    SUPPORT_INQUIRY_STATUS.CLOSED,
  ],
  [SUPPORT_INQUIRY_STATUS.IN_PROGRESS]: [
    SUPPORT_INQUIRY_STATUS.RESOLVED,
    SUPPORT_INQUIRY_STATUS.CLOSED,
  ],
  [SUPPORT_INQUIRY_STATUS.RESOLVED]: [SUPPORT_INQUIRY_STATUS.CLOSED],
  [SUPPORT_INQUIRY_STATUS.CLOSED]: [],
};

export function validateSupportInquiryTransition(
  currentStatus: SupportInquiryStatus,
  newStatus: SupportInquiryStatus,
): boolean {
  return VALID_TRANSITIONS[currentStatus].includes(newStatus);
}

async function enrichInquiry(ctx: QueryCtx, inquiry: Doc<"support_inquiries">) {
  const assignedAdmin = inquiry.assigned_admin_id
    ? await ctx.db.get(inquiry.assigned_admin_id)
    : null;

  return {
    ...inquiry,
    assigned_admin_name: assignedAdmin?.name ?? null,
    assigned_admin_email: assignedAdmin?.email ?? null,
  };
}

// Internal: the only entry point is the public contact-form HTTP route (convex/http.ts).
export const submit = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    subject: v.string(),
    message: v.string(),
    preferred_contact_method: v.optional(supportInquiryPreferredContactMethodValidator),
    persona_type: v.optional(supportInquiryPersonaTypeValidator),
    source_channel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    const subject = args.subject.trim();
    const message = args.message.trim();
    const rawPhone = args.phone?.trim();

    if (rawPhone && rawPhone.length > 15) {
      throw new Error("Phone too long");
    }

    const phone = rawPhone ? normalizePhone(rawPhone) : undefined;

    await rateLimiter.limit(ctx, "public:support_inquiry", {
      key: phone || email,
      throws: true,
    });

    if (name.length < 2) {
      throw new Error("Name must be at least 2 characters");
    }
    if (name.length > 200) {
      throw new Error("Name too long");
    }
    if (email.length > 254) {
      throw new Error("Email too long");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email format");
    }
    if (subject.length < 3) {
      throw new Error("Subject must be at least 3 characters");
    }
    if (subject.length > 500) {
      throw new Error("Subject too long");
    }
    if (message.length < 10) {
      throw new Error("Message must be at least 10 characters");
    }
    if (message.length > 5000) {
      throw new Error("Message too long");
    }

    return await ctx.db.insert("support_inquiries", {
      name,
      email,
      phone,
      subject,
      message,
      preferred_contact_method: args.preferred_contact_method,
      persona_type: args.persona_type,
      source_channel: args.source_channel?.trim() || undefined,
      status: SUPPORT_INQUIRY_STATUS.OPEN,
      ops_notes: undefined,
      assigned_admin_id: undefined,
      resolved_at: undefined,
      closed_at: undefined,
      ip_address: undefined,
      is_deleted: false,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("support_inquiries"),
    status: supportInquiryUpdateStatusValidator,
    ops_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.SUPPORT_INQUIRIES_MANAGE);

    const inquiry = await ctx.db.get(args.id);
    if (!inquiry || inquiry.is_deleted) {
      throw new Error("Support inquiry not found");
    }

    if (!validateSupportInquiryTransition(inquiry.status, args.status)) {
      throw new Error(`Cannot transition from ${inquiry.status} to ${args.status}`);
    }

    const patch: Partial<Doc<"support_inquiries">> = {
      status: args.status,
    };

    const trimmedNotes = args.ops_notes?.trim();
    if (trimmedNotes) {
      patch.ops_notes = trimmedNotes;
    }

    if (args.status === SUPPORT_INQUIRY_STATUS.RESOLVED) {
      patch.resolved_at = inquiry.resolved_at ?? Date.now();
      patch.closed_at = undefined;
    }

    if (args.status === SUPPORT_INQUIRY_STATUS.CLOSED) {
      patch.closed_at = inquiry.closed_at ?? Date.now();
      if (inquiry.status === SUPPORT_INQUIRY_STATUS.RESOLVED) {
        patch.resolved_at = inquiry.resolved_at ?? Date.now();
      }
    }

    await ctx.db.patch(args.id, patch);
    return await ctx.db.get(args.id);
  },
});

export const assign = mutation({
  args: {
    id: v.id("support_inquiries"),
    assigned_admin_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.SUPPORT_INQUIRIES_MANAGE);

    const inquiry = await ctx.db.get(args.id);
    if (!inquiry || inquiry.is_deleted) {
      throw new Error("Support inquiry not found");
    }

    const admin = await ctx.db.get(args.assigned_admin_id);
    if (!admin || admin.user_type !== USER_TYPE.ADMIN) {
      throw new Error("Assigned user must be an admin");
    }
    if (admin.status !== USER_STATUS.ACTIVE) {
      throw new Error("Assigned admin is not active");
    }

    await ctx.db.patch(args.id, { assigned_admin_id: args.assigned_admin_id });
    return await ctx.db.get(args.id);
  },
});

export const updateOpsNotes = mutation({
  args: {
    id: v.id("support_inquiries"),
    ops_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.SUPPORT_INQUIRIES_MANAGE);

    const inquiry = await ctx.db.get(args.id);
    if (!inquiry || inquiry.is_deleted) {
      throw new Error("Support inquiry not found");
    }

    const trimmedNotes = args.ops_notes?.trim();
    await ctx.db.patch(args.id, {
      ops_notes: trimmedNotes && trimmedNotes.length > 0 ? trimmedNotes : undefined,
    });

    return await ctx.db.get(args.id);
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(supportInquiryStatusValidator),
    persona_type: v.optional(supportInquiryPersonaTypeValidator),
    assigned_admin_id: v.optional(v.id("users")),
    preferred_contact_method: v.optional(supportInquiryPreferredContactMethodValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.SUPPORT_INQUIRIES_VIEW);

    let indexedBy: "status" | "persona_type" | "assigned_admin_id" | null = null;

    let inquiriesQuery = (() => {
      if (args.assigned_admin_id) {
        indexedBy = "assigned_admin_id";
        return ctx.db
          .query("support_inquiries")
          .withIndex("by_assigned_admin_id", (q) =>
            q.eq("assigned_admin_id", args.assigned_admin_id!),
          );
      }

      if (args.persona_type) {
        indexedBy = "persona_type";
        return ctx.db
          .query("support_inquiries")
          .withIndex("by_persona_type", (q) => q.eq("persona_type", args.persona_type!));
      }

      if (args.status) {
        indexedBy = "status";
        return ctx.db
          .query("support_inquiries")
          .withIndex("by_status", (q) => q.eq("status", args.status!));
      }

      return ctx.db.query("support_inquiries");
    })();

    inquiriesQuery = inquiriesQuery.filter((q) => q.neq(q.field("is_deleted"), true));

    if (args.status && indexedBy !== "status") {
      inquiriesQuery = inquiriesQuery.filter((q) => q.eq(q.field("status"), args.status));
    }

    if (args.persona_type && indexedBy !== "persona_type") {
      inquiriesQuery = inquiriesQuery.filter((q) =>
        q.eq(q.field("persona_type"), args.persona_type),
      );
    }

    if (args.assigned_admin_id && indexedBy !== "assigned_admin_id") {
      inquiriesQuery = inquiriesQuery.filter((q) =>
        q.eq(q.field("assigned_admin_id"), args.assigned_admin_id),
      );
    }

    if (args.preferred_contact_method) {
      inquiriesQuery = inquiriesQuery.filter((q) =>
        q.eq(q.field("preferred_contact_method"), args.preferred_contact_method),
      );
    }

    const paginatedResults = await inquiriesQuery.order("desc").paginate(args.paginationOpts);

    const enriched = await Promise.all(
      paginatedResults.page.map((inquiry) => enrichInquiry(ctx, inquiry)),
    );

    return {
      ...paginatedResults,
      page: enriched,
    } as PaginationResult<(typeof enriched)[number]>;
  },
});

export const getById = query({
  args: {
    id: v.id("support_inquiries"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.SUPPORT_INQUIRIES_VIEW);

    const inquiry = await ctx.db.get(args.id);
    if (!inquiry || inquiry.is_deleted) {
      throw new Error("Support inquiry not found");
    }

    return await enrichInquiry(ctx, inquiry);
  },
});

export const getStatusCounts = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.SUPPORT_INQUIRIES_VIEW);

    const allInquiries = await ctx.db
      .query("support_inquiries")
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const counts: Record<SupportInquiryStatus, number> = {
      [SUPPORT_INQUIRY_STATUS.OPEN]: 0,
      [SUPPORT_INQUIRY_STATUS.IN_PROGRESS]: 0,
      [SUPPORT_INQUIRY_STATUS.RESOLVED]: 0,
      [SUPPORT_INQUIRY_STATUS.CLOSED]: 0,
    };

    for (const inquiry of allInquiries) {
      counts[inquiry.status] = (counts[inquiry.status] ?? 0) + 1;
    }

    return counts;
  },
});

export const getSubmittedCount = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.SUPPORT_INQUIRIES_VIEW);

    const openInquiries = await ctx.db
      .query("support_inquiries")
      .withIndex("by_status", (q) => q.eq("status", SUPPORT_INQUIRY_STATUS.OPEN))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    return openInquiries.length;
  },
});
