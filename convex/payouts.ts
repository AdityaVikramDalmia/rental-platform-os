import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  CLOSURE_STATUS,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  PAYOUT_METHOD,
  PAYOUT_STATUS,
  PERMISSIONS,
  type PayoutStatus,
} from "../lib/constants";
import { requireFieldWorkerAuth, requirePermission } from "./auth.helpers";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";

const payoutStatusValidator = v.union(
  v.literal(PAYOUT_STATUS.PENDING),
  v.literal(PAYOUT_STATUS.APPROVED),
  v.literal(PAYOUT_STATUS.DISBURSED),
  v.literal(PAYOUT_STATUS.FAILED),
  v.literal(PAYOUT_STATUS.VOIDED),
);

const payoutMethodValidator = v.union(
  v.literal(PAYOUT_METHOD.CASH),
  v.literal(PAYOUT_METHOD.UPI),
  v.literal(PAYOUT_METHOD.BANK_TRANSFER),
);

type PayoutDoc = Doc<"payouts">;

type EnrichedPayout = {
  payout: PayoutDoc;
  closure: Doc<"closures"> | null;
  lead: Doc<"leads"> | null;
  guard: Pick<Doc<"users">, "_id" | "name" | "phone" | "status"> | null;
  building: Doc<"buildings"> | null;
  society: Doc<"societies"> | null;
  approved_by_name: string | null;
  voided_by_name: string | null;
};

type GuardEarningsPayout = {
  payout_id: Id<"payouts">;
  status: PayoutStatus;
  closure_id: Id<"closures">;
  lead_id: Id<"leads">;
  building_name: string | null;
  flat_number: string | null;
  closure_confirmed_at: number | undefined;
  prospective_bounty: number | undefined;
  payment_reference: string | undefined;
  disbursed_at: number | undefined;
  failure_reason: string | undefined;
  created_at: number;
  amount_paise?: number;
};

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function assertPositiveIntegerPaise(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive whole number in paise`);
  }
}

function assertNonNegativeIntegerPaise(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a whole number in paise`);
  }
}

async function getPayoutContext(
  ctx: QueryCtx | MutationCtx,
  payout: PayoutDoc,
): Promise<EnrichedPayout> {
  const [closure, lead, guardUser, approverUser, voiderUser] = await Promise.all([
    ctx.db.get(payout.closure_id),
    ctx.db.get(payout.lead_id),
    ctx.db.get(payout.guard_user_id),
    payout.approved_by_admin_id ? ctx.db.get(payout.approved_by_admin_id) : null,
    payout.voided_by ? ctx.db.get(payout.voided_by) : null,
  ]);

  const building = lead ? await ctx.db.get(lead.building_id) : null;
  const society = building ? await ctx.db.get(building.society_id) : null;

  return {
    payout,
    closure,
    lead,
    guard: guardUser
      ? {
          _id: guardUser._id,
          name: guardUser.name,
          phone: guardUser.phone,
          status: guardUser.status,
        }
      : null,
    building,
    society,
    approved_by_name: approverUser?.name ?? null,
    voided_by_name: voiderUser?.name ?? null,
  };
}

export function validatePayoutTransition(
  currentStatus: PayoutStatus,
  newStatus: PayoutStatus,
): boolean {
  const validTransitions: Record<PayoutStatus, readonly PayoutStatus[]> = {
    [PAYOUT_STATUS.PENDING]: [PAYOUT_STATUS.APPROVED, PAYOUT_STATUS.VOIDED],
    [PAYOUT_STATUS.APPROVED]: [PAYOUT_STATUS.DISBURSED, PAYOUT_STATUS.FAILED, PAYOUT_STATUS.VOIDED],
    [PAYOUT_STATUS.DISBURSED]: [],
    [PAYOUT_STATUS.FAILED]: [],
    [PAYOUT_STATUS.VOIDED]: [],
  };

  return (validTransitions[currentStatus] ?? []).includes(newStatus);
}

export const create = mutation({
  args: {
    closure_id: v.id("closures"),
    amount_paise: v.number(),
    payment_reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.PAYOUTS_CREATE);
    assertPositiveIntegerPaise(args.amount_paise, "amount_paise");

    const closure = await ctx.db.get(args.closure_id);

    if (!closure) {
      throw new Error("Closure not found");
    }

    if (closure.status !== CLOSURE_STATUS.CONFIRMED) {
      throw new Error("Only CONFIRMED closures can have payouts");
    }

    const existingPayout = await ctx.db
      .query("payouts")
      .withIndex("by_closure_id", (q) => q.eq("closure_id", args.closure_id))
      .first();

    if (existingPayout) {
      throw new Error("A payout already exists for this closure");
    }

    const lead = await ctx.db.get(closure.lead_id);

    if (!lead) {
      throw new Error("Lead not found for closure");
    }

    const payoutId = await ctx.db.insert("payouts", {
      guard_user_id: lead.submitted_by_guard_id,
      lead_id: closure.lead_id,
      closure_id: args.closure_id,
      amount_paise: args.amount_paise,
      status: PAYOUT_STATUS.PENDING,
      initiated_by_admin_id: admin._id,
      payment_reference: normalizeOptionalString(args.payment_reference),
    });

    await ctx.runMutation(internal.incentives.computePayoutAdjustment, {
      payout_id: payoutId,
      guard_user_id: lead.submitted_by_guard_id,
      base_amount_paise: args.amount_paise,
    });

    return await ctx.db.get(payoutId);
  },
});

export const getAdjustment = query({
  args: {
    payout_id: v.id("payouts"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PAYOUTS_VIEW);

    return await ctx.db
      .query("payout_adjustments")
      .withIndex("by_payout", (q) => q.eq("payout_id", args.payout_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .first();
  },
});

export const overrideAmount = mutation({
  args: {
    payout_id: v.id("payouts"),
    override_amount_paise: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PAYOUTS_APPROVE);
    assertNonNegativeIntegerPaise(args.override_amount_paise, "override_amount_paise");

    const payout = await ctx.db.get(args.payout_id);

    if (!payout) {
      throw new Error("Payout not found");
    }

    if (payout.status !== PAYOUT_STATUS.PENDING) {
      throw new Error("Only pending payouts can be overridden");
    }

    const adjustment = await ctx.db
      .query("payout_adjustments")
      .withIndex("by_payout", (q) => q.eq("payout_id", args.payout_id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .first();

    if (adjustment) {
      await ctx.db.patch(adjustment._id, {
        admin_override_paise: args.override_amount_paise,
        final_amount_paise: args.override_amount_paise,
      });
    }

    await ctx.db.patch(args.payout_id, {
      amount_paise: args.override_amount_paise,
    });

    return await ctx.db.get(args.payout_id);
  },
});

export const getById = query({
  args: {
    id: v.id("payouts"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PAYOUTS_VIEW);
    const payout = await ctx.db.get(args.id);

    if (!payout) {
      throw new Error("Payout not found");
    }

    const context = await getPayoutContext(ctx, payout);

    return {
      payout,
      closure: context.closure,
      lead: context.lead,
      guard: context.guard,
      building: context.building,
      society: context.society,
      approved_by_name: context.approved_by_name,
      voided_by_name: context.voided_by_name,
    };
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(payoutStatusValidator),
    guard_user_id: v.optional(v.id("users")),
    date_from: v.optional(v.number()),
    date_to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PAYOUTS_VIEW);

    if (
      args.date_from !== undefined &&
      args.date_to !== undefined &&
      args.date_from > args.date_to
    ) {
      throw new Error("date_from must be less than or equal to date_to");
    }

    let paginatedResults: PaginationResult<PayoutDoc>;

    if (args.status !== undefined) {
      const status = args.status;
      paginatedResults = await ctx.db
        .query("payouts")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .paginate(args.paginationOpts);
    } else if (args.guard_user_id !== undefined) {
      const guardUserId = args.guard_user_id;
      paginatedResults = await ctx.db
        .query("payouts")
        .withIndex("by_guard_user_id", (q) => q.eq("guard_user_id", guardUserId))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      paginatedResults = await ctx.db.query("payouts").order("desc").paginate(args.paginationOpts);
    }

    const enrichedPayouts = await Promise.all(
      paginatedResults.page.map(async (payout) => {
        return await getPayoutContext(ctx, payout);
      }),
    );

    const filteredPayouts = enrichedPayouts.filter(({ payout }) => {
      if (args.status !== undefined && payout.status !== args.status) {
        return false;
      }

      if (args.guard_user_id !== undefined && payout.guard_user_id !== args.guard_user_id) {
        return false;
      }

      if (args.date_from !== undefined && payout._creationTime < args.date_from) {
        return false;
      }

      if (args.date_to !== undefined && payout._creationTime > args.date_to) {
        return false;
      }

      return true;
    });

    return {
      ...paginatedResults,
      page: filteredPayouts,
    } as PaginationResult<EnrichedPayout>;
  },
});

export const approve = mutation({
  args: {
    id: v.id("payouts"),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.PAYOUTS_APPROVE);
    const payout = await ctx.db.get(args.id);

    if (!payout) {
      throw new Error("Payout not found");
    }

    if (!validatePayoutTransition(payout.status, PAYOUT_STATUS.APPROVED)) {
      throw new Error(`Cannot approve payout with status: ${payout.status}`);
    }

    // Sync adjustment final amount to payout before approval
    const adjustment = await ctx.db
      .query("payout_adjustments")
      .withIndex("by_payout", (q) => q.eq("payout_id", args.id))
      .filter((q) => q.neq(q.field("is_deleted"), true))
      .first();

    const finalAmount =
      adjustment?.admin_override_paise ?? adjustment?.final_amount_paise ?? payout.amount_paise;

    await ctx.db.patch(args.id, {
      status: PAYOUT_STATUS.APPROVED,
      amount_paise: finalAmount,
      approved_by_admin_id: admin._id,
      approved_at: Date.now(),
    });

    try {
      await ctx.scheduler.runAfter(0, internal.notifications.emitEvent, {
        user_id: payout.guard_user_id,
        event_type: "payout_approved",
        category: NOTIFICATION_CATEGORY.PAYOUT_UPDATE,
        severity: NOTIFICATION_SEVERITY.IMPORTANT,
        payload: {
          amount_inr: `Rs ${(payout.amount_paise / 100).toLocaleString("en-IN")}`,
        },
        dedup_key: `payout:${args.id}:approved`,
        action_url: "/guard/earnings",
      });
    } catch (error) {
      console.error("Failed to enqueue payout approved notification (non-blocking):", error);
    }

    return await ctx.db.get(args.id);
  },
});

export const disburse = mutation({
  args: {
    id: v.id("payouts"),
    payment_reference: v.optional(v.string()),
    method: v.optional(payoutMethodValidator),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PAYOUTS_DISBURSE);
    const payout = await ctx.db.get(args.id);

    if (!payout) {
      throw new Error("Payout not found");
    }

    if (!validatePayoutTransition(payout.status, PAYOUT_STATUS.DISBURSED)) {
      throw new Error(`Cannot disburse payout with status: ${payout.status}`);
    }

    await ctx.db.patch(args.id, {
      status: PAYOUT_STATUS.DISBURSED,
      disbursed_at: Date.now(),
      payment_reference: normalizeOptionalString(args.payment_reference),
      method: args.method,
    });

    try {
      const paymentRef =
        normalizeOptionalString(args.payment_reference) ?? payout.payment_reference;

      await ctx.scheduler.runAfter(0, internal.notifications.emitEvent, {
        user_id: payout.guard_user_id,
        event_type: "payout_disbursed",
        category: NOTIFICATION_CATEGORY.PAYOUT_UPDATE,
        severity: NOTIFICATION_SEVERITY.IMPORTANT,
        payload: {
          amount_inr: `Rs ${(payout.amount_paise / 100).toLocaleString("en-IN")}`,
          payment_ref: paymentRef ?? `PAYOUT-${args.id}`,
        },
        dedup_key: `payout:${args.id}:disbursed`,
        action_url: "/guard/earnings",
      });
    } catch (error) {
      console.error("Failed to enqueue payout disbursed notification (non-blocking):", error);
    }

    return await ctx.db.get(args.id);
  },
});

export const fail = mutation({
  args: {
    id: v.id("payouts"),
    failure_reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.PAYOUTS_DISBURSE);
    const payout = await ctx.db.get(args.id);

    if (!payout) {
      throw new Error("Payout not found");
    }

    if (!validatePayoutTransition(payout.status, PAYOUT_STATUS.FAILED)) {
      throw new Error(`Cannot fail payout with status: ${payout.status}`);
    }

    const failureReason = args.failure_reason.trim();

    if (!failureReason) {
      throw new Error("failure_reason is required");
    }

    await ctx.db.patch(args.id, {
      status: PAYOUT_STATUS.FAILED,
      failure_reason: failureReason,
    });

    return await ctx.db.get(args.id);
  },
});

const voidMutation = mutation({
  args: {
    id: v.id("payouts"),
    voided_reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requirePermission(ctx, PERMISSIONS.PAYOUTS_VOID);
    const payout = await ctx.db.get(args.id);

    if (!payout) {
      throw new Error("Payout not found");
    }

    if (!validatePayoutTransition(payout.status, PAYOUT_STATUS.VOIDED)) {
      throw new Error(`Cannot void payout with status: ${payout.status}`);
    }

    await ctx.db.patch(args.id, {
      status: PAYOUT_STATUS.VOIDED,
      voided_reason: normalizeOptionalString(args.voided_reason),
      voided_by: admin._id,
      voided_at: Date.now(),
    });

    return await ctx.db.get(args.id);
  },
});

export { voidMutation as voidPayout };

export const getGuardEarnings = query({
  args: {},
  handler: async (ctx) => {
    const { user: guard } = await requireFieldWorkerAuth(ctx);
    const payouts = await ctx.db
      .query("payouts")
      .withIndex("by_guard_user_id", (q) => q.eq("guard_user_id", guard._id))
      .collect();

    const enriched = await Promise.all(
      payouts.map(async (payout) => {
        const [lead, closure] = await Promise.all([
          ctx.db.get(payout.lead_id),
          ctx.db.get(payout.closure_id),
        ]);

        const building = lead ? await ctx.db.get(lead.building_id) : null;

        const base: GuardEarningsPayout = {
          payout_id: payout._id,
          status: payout.status,
          closure_id: payout.closure_id,
          lead_id: payout.lead_id,
          building_name: building?.name ?? null,
          flat_number: lead?.flat_number ?? null,
          closure_confirmed_at: closure?.confirmed_at,
          prospective_bounty: lead?.prospective_bounty,
          payment_reference: payout.payment_reference,
          disbursed_at: payout.disbursed_at,
          failure_reason: payout.failure_reason,
          created_at: payout._creationTime,
        };

        if (payout.status === PAYOUT_STATUS.PENDING) {
          return base;
        }

        return {
          ...base,
          amount_paise: payout.amount_paise,
        };
      }),
    );

    const pending = enriched
      .filter(
        (payout) =>
          payout.status === PAYOUT_STATUS.PENDING || payout.status === PAYOUT_STATUS.APPROVED,
      )
      .sort((a, b) => b.created_at - a.created_at);

    const disbursed = enriched
      .filter((payout) => payout.status === PAYOUT_STATUS.DISBURSED)
      .sort((a, b) => (b.disbursed_at ?? 0) - (a.disbursed_at ?? 0));

    const failed = enriched
      .filter((payout) => payout.status === PAYOUT_STATUS.FAILED)
      .sort((a, b) => b.created_at - a.created_at);

    const total_earned = disbursed.reduce((sum, payout) => {
      return sum + (payout.amount_paise ?? 0);
    }, 0);

    return {
      pending,
      disbursed,
      failed,
      total_earned,
    };
  },
});
