import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  OWNER_SERVICE_REQUEST_STATUS,
  PERMISSIONS,
  USER_STATUS,
  USER_TYPE,
  type OwnerServiceRequestStatus,
} from "../lib/constants";
import { normalizePhone } from "../lib/validators";
import { addPersonaToUser, requireOwner, requirePermission } from "./auth.helpers";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, mutation, query } from "./functions";
import { rateLimiter } from "./rateLimiter";

const ownerServiceRequestStatusValidator = v.union(
  v.literal(OWNER_SERVICE_REQUEST_STATUS.SUBMITTED),
  v.literal(OWNER_SERVICE_REQUEST_STATUS.CONTACTED),
  v.literal(OWNER_SERVICE_REQUEST_STATUS.ONBOARDED),
  v.literal(OWNER_SERVICE_REQUEST_STATUS.ACTIVE),
  v.literal(OWNER_SERVICE_REQUEST_STATUS.REJECTED),
  v.literal(OWNER_SERVICE_REQUEST_STATUS.DROPPED),
);

const ownerServiceRequestUpdateStatusValidator = v.union(
  v.literal(OWNER_SERVICE_REQUEST_STATUS.CONTACTED),
  v.literal(OWNER_SERVICE_REQUEST_STATUS.REJECTED),
  v.literal(OWNER_SERVICE_REQUEST_STATUS.DROPPED),
);

const VALID_TRANSITIONS: Record<string, string[]> = {
  [OWNER_SERVICE_REQUEST_STATUS.SUBMITTED]: [
    OWNER_SERVICE_REQUEST_STATUS.CONTACTED,
    OWNER_SERVICE_REQUEST_STATUS.REJECTED,
  ],
  [OWNER_SERVICE_REQUEST_STATUS.CONTACTED]: [
    OWNER_SERVICE_REQUEST_STATUS.ONBOARDED,
    OWNER_SERVICE_REQUEST_STATUS.DROPPED,
  ],
  [OWNER_SERVICE_REQUEST_STATUS.ONBOARDED]: [OWNER_SERVICE_REQUEST_STATUS.ACTIVE],
};

export function validateOwnerServiceRequestTransition(
  currentStatus: string,
  newStatus: string,
): boolean {
  return (VALID_TRANSITIONS[currentStatus] ?? []).includes(newStatus);
}

function resolveWorkosUserId(
  subject: string | null | undefined,
  tokenIdentifier: string,
): string | null {
  if (subject && subject.length > 0) {
    return subject;
  }

  if (!tokenIdentifier) {
    return null;
  }

  const delimiterIndex = tokenIdentifier.lastIndexOf("|");
  return delimiterIndex === -1 ? tokenIdentifier : tokenIdentifier.slice(delimiterIndex + 1);
}

export const checkPermission = internalQuery({
  args: {
    permission: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return { authorized: false };
    }

    const workosUserId = resolveWorkosUserId(identity.subject, identity.tokenIdentifier);

    if (!workosUserId) {
      return { authorized: false };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", workosUserId))
      .unique();

    if (!user) {
      return { authorized: false };
    }

    if (user.status === USER_STATUS.BANNED) {
      return { authorized: false };
    }

    if (user.status !== USER_STATUS.ACTIVE) {
      return { authorized: false };
    }

    if (
      !(user.user_types?.includes(USER_TYPE.ADMIN) ?? user.user_type === USER_TYPE.ADMIN) &&
      !(user.user_types?.includes(USER_TYPE.OPS) ?? user.user_type === USER_TYPE.OPS)
    ) {
      return { authorized: false };
    }

    const assignments = await ctx.db
      .query("user_role_assignments")
      .withIndex("by_user_id", (q) => q.eq("user_id", user._id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .collect();

    const roles = await Promise.all(
      assignments.map((assignment) => ctx.db.get(assignment.role_id)),
    );
    const permissions = new Set<string>();

    for (const role of roles) {
      if (!role || role.is_deleted) {
        continue;
      }

      for (const rolePermission of role.permissions) {
        permissions.add(rolePermission);
      }
    }

    return { authorized: permissions.has(args.permission) };
  },
});

async function enrichRequest(ctx: QueryCtx, request: Doc<"owner_service_requests">) {
  const assignedAdmin = request.assigned_admin_id
    ? await ctx.db.get(request.assigned_admin_id)
    : null;
  const ownerUser = request.owner_user_id ? await ctx.db.get(request.owner_user_id) : null;

  return {
    ...request,
    assigned_admin_name: assignedAdmin?.name ?? null,
    owner_workos_id: ownerUser?.workos_user_id ?? null,
  };
}

export const submit = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    property_type: v.optional(v.string()),
    location: v.optional(v.string()),
    property_value: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const rawPhone = args.phone.trim();
    const email = args.email?.trim().toLowerCase() || undefined;
    const propertyType = args.property_type?.trim() || undefined;
    const location = args.location?.trim() || undefined;
    const notes = args.notes?.trim() || undefined;

    if (name.length < 2) {
      throw new Error("Name must be at least 2 characters");
    }
    if (name.length > 200) {
      throw new Error("Name too long");
    }

    if (rawPhone.length > 15) {
      throw new Error("Phone too long");
    }

    const phone = normalizePhone(rawPhone);

    if (email && email.length > 254) {
      throw new Error("Email too long");
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email format");
    }

    if (propertyType && propertyType.length > 200) {
      throw new Error("Property type too long");
    }

    if (location && location.length > 500) {
      throw new Error("Location too long");
    }

    if (notes && notes.length > 5000) {
      throw new Error("Notes too long");
    }

    if (
      args.property_value !== undefined &&
      (!Number.isInteger(args.property_value) || args.property_value <= 0)
    ) {
      throw new Error("Property value must be a positive integer paise amount");
    }

    await rateLimiter.limit(ctx, "public:owner_service_request", { key: phone, throws: true });

    return await ctx.db.insert("owner_service_requests", {
      name,
      phone,
      email,
      property_type: propertyType,
      location,
      property_value: args.property_value,
      notes,
      status: OWNER_SERVICE_REQUEST_STATUS.SUBMITTED,
      ops_notes: undefined,
      assigned_admin_id: undefined,
      contacted_at: undefined,
      owner_user_id: undefined,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("owner_service_requests"),
    status: ownerServiceRequestUpdateStatusValidator,
    ops_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.OWNER_SERVICE_REQUESTS_MANAGE);
    const request = await ctx.db.get(args.id);
    if (!request) {
      throw new Error("Owner service request not found");
    }

    if (!validateOwnerServiceRequestTransition(request.status, args.status)) {
      throw new Error(`Cannot transition from ${request.status} to ${args.status}`);
    }

    if (
      (args.status === OWNER_SERVICE_REQUEST_STATUS.REJECTED ||
        args.status === OWNER_SERVICE_REQUEST_STATUS.DROPPED) &&
      (!args.ops_notes || args.ops_notes.trim().length === 0)
    ) {
      throw new Error("Ops notes are required when rejecting or dropping a request");
    }

    const patch: Partial<Doc<"owner_service_requests">> = {
      status: args.status,
    };

    if (args.ops_notes?.trim()) {
      patch.ops_notes = args.ops_notes.trim();
    }

    if (args.status === OWNER_SERVICE_REQUEST_STATUS.CONTACTED && !request.contacted_at) {
      patch.contacted_at = Date.now();
      patch.assigned_admin_id = admin._id;
    }

    await ctx.db.patch(args.id, patch);
    return await ctx.db.get(args.id);
  },
});

export const activate = mutation({
  args: {
    id: v.id("owner_service_requests"),
    ops_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNER_SERVICE_REQUESTS_MANAGE);

    const request = await ctx.db.get(args.id);
    if (!request) {
      throw new Error("Owner service request not found");
    }

    if (
      !validateOwnerServiceRequestTransition(request.status, OWNER_SERVICE_REQUEST_STATUS.ACTIVE)
    ) {
      throw new Error(`Cannot activate request with status: ${request.status}`);
    }

    await ctx.db.patch(args.id, {
      status: OWNER_SERVICE_REQUEST_STATUS.ACTIVE,
      ops_notes: args.ops_notes?.trim() || request.ops_notes,
    });

    return await ctx.db.get(args.id);
  },
});

export const onboardInternal = internalMutation({
  args: {
    request_id: v.id("owner_service_requests"),
    owner_user_id: v.id("users"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.request_id);
    if (!request) {
      throw new Error("Owner service request not found");
    }

    if (
      !validateOwnerServiceRequestTransition(request.status, OWNER_SERVICE_REQUEST_STATUS.ONBOARDED)
    ) {
      throw new Error(
        `Cannot onboard request with status: ${request.status}. Must be CONTACTED first.`,
      );
    }

    await ctx.db.patch(args.request_id, {
      status: OWNER_SERVICE_REQUEST_STATUS.ONBOARDED,
      owner_user_id: args.owner_user_id,
    });
  },
});

export const getRequestState = internalQuery({
  args: {
    id: v.id("owner_service_requests"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request) {
      return null;
    }

    return { status: request.status };
  },
});

export const createOwnerUserInternal = internalMutation({
  args: {
    workos_user_id: v.string(),
    name: v.string(),
    email: v.string(),
    request_id: v.id("owner_service_requests"),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) => q.eq("workos_user_id", args.workos_user_id))
      .unique();

    const request = await ctx.db.get(args.request_id);
    if (!request) {
      throw new Error("Owner service request not found");
    }

    let userId: Id<"users">;

    if (existing) {
      await addPersonaToUser(ctx, existing._id, USER_TYPE.OWNER);
      userId = existing._id;
    } else {
      userId = await ctx.db.insert("users", {
        workos_user_id: args.workos_user_id,
        user_type: USER_TYPE.OWNER,
        name: args.name.trim(),
        email: args.email.trim().toLowerCase(),
        phone: undefined,
        status: USER_STATUS.ACTIVE,
        must_change_password: false,
      });
    }

    return userId;
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(ownerServiceRequestStatusValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW);

    const requestsQuery = args.status
      ? ctx.db
          .query("owner_service_requests")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
      : ctx.db.query("owner_service_requests");

    const paginatedResults = await requestsQuery.order("desc").paginate(args.paginationOpts);

    const enriched = await Promise.all(
      paginatedResults.page.map((request) => enrichRequest(ctx, request)),
    );

    return {
      ...paginatedResults,
      page: enriched,
    } as PaginationResult<(typeof enriched)[number]>;
  },
});

export const getById = query({
  args: {
    id: v.id("owner_service_requests"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW);

    const request = await ctx.db.get(args.id);
    if (!request) {
      throw new Error("Owner service request not found");
    }

    return await enrichRequest(ctx, request);
  },
});

export const getStatusCounts = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW);

    const allRequests = await ctx.db.query("owner_service_requests").collect();

    const counts: Record<OwnerServiceRequestStatus, number> = {
      [OWNER_SERVICE_REQUEST_STATUS.SUBMITTED]: 0,
      [OWNER_SERVICE_REQUEST_STATUS.CONTACTED]: 0,
      [OWNER_SERVICE_REQUEST_STATUS.ONBOARDED]: 0,
      [OWNER_SERVICE_REQUEST_STATUS.ACTIVE]: 0,
      [OWNER_SERVICE_REQUEST_STATUS.REJECTED]: 0,
      [OWNER_SERVICE_REQUEST_STATUS.DROPPED]: 0,
    };

    for (const request of allRequests) {
      counts[request.status] = (counts[request.status] ?? 0) + 1;
    }

    return counts;
  },
});

export const getSubmittedCount = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW);

    const submitted = await ctx.db
      .query("owner_service_requests")
      .withIndex("by_status", (q) => q.eq("status", OWNER_SERVICE_REQUEST_STATUS.SUBMITTED))
      .collect();

    return submitted.length;
  },
});

export const getMyRequests = query({
  args: {},
  handler: async (ctx) => {
    const ownerUser = await requireOwner(ctx);

    const owners = await ctx.db
      .query("owners")
      .withIndex("by_user_id", (q) => q.eq("user_id", ownerUser._id))
      .filter((q) =>
        q.and(q.neq(q.field("is_deleted"), true), q.eq(q.field("merged_into_id"), undefined)),
      )
      .collect();

    if (owners.length === 0) {
      return { requests: [] };
    }

    const owner = owners.reduce((latest, candidate) => {
      if (candidate._creationTime > latest._creationTime) {
        return candidate;
      }

      if (candidate._creationTime === latest._creationTime) {
        return String(candidate._id) > String(latest._id) ? candidate : latest;
      }

      return latest;
    });

    const requests = await ctx.db
      .query("owner_service_requests")
      .withIndex("by_phone", (q) => q.eq("phone", owner.phone))
      .order("desc")
      .collect();

    return {
      requests: requests.map((request) => ({
        _id: request._id,
        status: request.status,
        _creationTime: request._creationTime,
        contacted_at: request.contacted_at ?? null,
        location: request.location ?? null,
        property_type: request.property_type ?? null,
        property_value: request.property_value ?? null,
        owner_visible_notes: request.ops_notes ?? null,
      })),
    };
  },
});
