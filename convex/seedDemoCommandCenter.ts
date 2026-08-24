// Demo data — all values are fictitious. Generated for development and
// open-source demonstration only.
import { NOTIFICATION_SEVERITY, NOTIFICATION_CATEGORY } from "../lib/constants";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./functions";
import { DEMO_EMAILS, ensureSeedRecord, lookupUserDoc } from "./seedHelpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const COMMAND_CENTER_REFERENCE_TS = Date.UTC(2026, 0, 20, 12, 0, 0);

function daysBeforeReference(days: number): number {
  return COMMAND_CENTER_REFERENCE_TS - days * DAY_MS;
}

type TargetSeed = {
  metric: Doc<"ops_kpi_targets">["metric"];
  period_type: Doc<"ops_kpi_targets">["period_type"];
  period_start: number;
  period_end: number;
  target_value: number;
  actual_value: number;
  notes: string;
};

function progressPercent(actualValue: number, targetValue: number): number {
  if (targetValue <= 0) {
    return 0;
  }

  return Math.round((actualValue / targetValue) * 10_000) / 100;
}

export const seedOpsTargetMissed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const founder_one = await lookupUserDoc(ctx, DEMO_EMAILS.founder_one);
    const ops1 = await lookupUserDoc(ctx, DEMO_EMAILS.ops1);

    const targetSeeds: TargetSeed[] = [
      {
        metric: "visits_completed",
        period_type: "WEEKLY",
        period_start: daysBeforeReference(14),
        period_end: daysBeforeReference(7),
        target_value: 20,
        actual_value: 7,
        notes: "Weekly visit throughput target missed in command-center scenario seed",
      },
      {
        metric: "leads_verified",
        period_type: "MONTHLY",
        period_start: daysBeforeReference(40),
        period_end: daysBeforeReference(10),
        target_value: 18,
        actual_value: 7,
        notes: "Monthly verification target set for under-50% progress seed",
      },
      {
        metric: "tenant_inquiry_resolutions",
        period_type: "QUARTERLY",
        period_start: daysBeforeReference(100),
        period_end: daysBeforeReference(5),
        target_value: 30,
        actual_value: 12,
        notes: "Quarterly inquiry resolution target underperformance seed",
      },
    ];

    const seededTargets: Array<Doc<"ops_kpi_targets">> = [];

    for (const targetSeed of targetSeeds) {
      const progress_pct = progressPercent(targetSeed.actual_value, targetSeed.target_value);
      const created_at = targetSeed.period_start + DAY_MS;
      const updated_at = targetSeed.period_end - DAY_MS;

      const target = await ensureSeedRecord(ctx, {
        label: "ops-kpi-target-missed",
        lookup: async () =>
          await ctx.db
            .query("ops_kpi_targets")
            .withIndex("by_agent_metric_period", (q) =>
              q
                .eq("agent_user_id", ops1._id)
                .eq("metric", targetSeed.metric)
                .eq("period_start", targetSeed.period_start),
            )
            .first(),
        create: async () =>
          await ctx.db.insert("ops_kpi_targets", {
            agent_user_id: ops1._id,
            set_by_user_id: founder_one._id,
            metric: targetSeed.metric,
            target_value: targetSeed.target_value,
            period_type: targetSeed.period_type,
            period_start: targetSeed.period_start,
            period_end: targetSeed.period_end,
            actual_value: targetSeed.actual_value,
            progress_pct,
            status: "MISSED",
            notes: targetSeed.notes,
            created_at,
            updated_at,
            is_deleted: false,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            set_by_user_id: founder_one._id,
            target_value: targetSeed.target_value,
            period_type: targetSeed.period_type,
            period_end: targetSeed.period_end,
            actual_value: targetSeed.actual_value,
            progress_pct,
            status: "MISSED",
            notes: targetSeed.notes,
            created_at,
            updated_at,
            is_deleted: false,
          });
        },
      });

      seededTargets.push(target.doc);
    }

    const warningDescription = seededTargets
      .map(
        (target) =>
          `${target.metric}: ${target.actual_value ?? 0}/${target.target_value} (${target.progress_pct ?? 0}%)`,
      )
      .join(" | ");

    const warning = await ensureSeedRecord(ctx, {
      label: "ops-warning-missed-targets",
      lookup: async () =>
        await ctx.db
          .query("ops_warnings")
          .withIndex("by_agent_level_reason_status", (q) =>
            q
              .eq("agent_user_id", ops1._id)
              .eq("warning_level", 1)
              .eq("trigger_reason", "MISSED_TARGETS")
              .eq("status", "ACTIVE"),
          )
          .first(),
      create: async () =>
        await ctx.db.insert("ops_warnings", {
          agent_user_id: ops1._id,
          issued_by_user_id: undefined,
          issued_by_type: "SYSTEM",
          warning_level: 1,
          trigger_type: "AUTO",
          trigger_reason: "MISSED_TARGETS",
          description: "Auto-warning: KPI progress below 50% for active OPS target set",
          evidence: warningDescription,
          status: "ACTIVE",
          acknowledged_at: undefined,
          resolved_at: undefined,
          resolution_notes: undefined,
          escalated_from_id: undefined,
          expires_at: daysBeforeReference(-20),
          created_at: daysBeforeReference(4),
          updated_at: daysBeforeReference(4),
          is_deleted: false,
        }),
      patchIfExists: async (existing) => {
        await ctx.db.patch(existing._id, {
          issued_by_user_id: undefined,
          issued_by_type: "SYSTEM",
          trigger_type: "AUTO",
          description: "Auto-warning: KPI progress below 50% for active OPS target set",
          evidence: warningDescription,
          status: "ACTIVE",
          expires_at: daysBeforeReference(-20),
          updated_at: daysBeforeReference(4),
          is_deleted: false,
        });
      },
    });

    const preBriefCheckIns: Array<{
      notes: string;
      sentiment: Doc<"ops_check_in_notes">["sentiment"];
      created_at: number;
      next_review_date: number;
      action_items: Doc<"ops_check_in_notes">["action_items"];
    }> = [
      {
        notes:
          "Pre-brief: Weekly and monthly targets are below 50%. Focus on high-intent inquiry follow-ups and daily closure blockers.",
        sentiment: "NEEDS_IMPROVEMENT",
        created_at: daysBeforeReference(3),
        next_review_date: daysBeforeReference(1),
        action_items: [
          {
            description: "Recover missed visits pipeline with 5 confirmed slots",
            due_date: daysBeforeReference(1),
            completed: false,
            completed_at: undefined,
          },
          {
            description: "Resolve three oldest tenant inquiries",
            due_date: daysBeforeReference(1),
            completed: false,
            completed_at: undefined,
          },
        ],
      },
      {
        notes:
          "Pre-brief follow-up: Progress still under threshold. Escalation warning remains active until KPI recovery is sustained.",
        sentiment: "NEUTRAL",
        created_at: daysBeforeReference(1),
        next_review_date: daysBeforeReference(-2),
        action_items: [
          {
            description: "Submit recovery plan for MISSED targets with daily checkpoints",
            due_date: daysBeforeReference(0),
            completed: false,
            completed_at: undefined,
          },
        ],
      },
    ];

    for (const checkInSeed of preBriefCheckIns) {
      await ensureSeedRecord(ctx, {
        label: "ops-prebrief-checkin",
        lookup: async () =>
          await ctx.db
            .query("ops_check_in_notes")
            .withIndex("by_agent", (q) => q.eq("agent_user_id", ops1._id))
            .filter((q) => q.eq(q.field("notes"), checkInSeed.notes))
            .first(),
        create: async () =>
          await ctx.db.insert("ops_check_in_notes", {
            agent_user_id: ops1._id,
            reviewer_user_id: founder_one._id,
            notes: checkInSeed.notes,
            action_items: checkInSeed.action_items,
            sentiment: checkInSeed.sentiment,
            next_review_date: checkInSeed.next_review_date,
            created_at: checkInSeed.created_at,
            updated_at: checkInSeed.created_at,
            is_deleted: false,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            reviewer_user_id: founder_one._id,
            action_items: checkInSeed.action_items,
            sentiment: checkInSeed.sentiment,
            next_review_date: checkInSeed.next_review_date,
            created_at: checkInSeed.created_at,
            updated_at: checkInSeed.created_at,
            is_deleted: false,
          });
        },
      });
    }

    await ensureSeedRecord(ctx, {
      label: "ops-warning-notification-event",
      lookup: async () =>
        await ctx.db
          .query("notification_events")
          .withIndex("by_dedup_key", (q) => q.eq("dedup_key", `seed:ops-warning:${ops1._id}`))
          .first(),
      create: async () =>
        await ctx.db.insert("notification_events", {
          user_id: ops1._id,
          event_type: "ops_warning_issued",
          category: NOTIFICATION_CATEGORY.SYSTEM_ALERT,
          severity: NOTIFICATION_SEVERITY.IMPORTANT,
          status: "PENDING",
          channels: ["IN_APP"],
          payload: {
            warning_id: `${warning.doc._id}`,
            trigger_reason: "MISSED_TARGETS",
            source: "seedOpsTargetMissed",
          },
          dedup_key: `seed:ops-warning:${ops1._id}`,
          channel_status: undefined,
          retry_count: 0,
          next_attempt_at: undefined,
          last_error: undefined,
          final_error: undefined,
          provider_message_id: undefined,
          attempted_at: undefined,
          delivered_at: undefined,
          failed_at: undefined,
          is_deleted: false,
          created_at: daysBeforeReference(4),
          updated_at: daysBeforeReference(4),
        }),
      patchIfExists: async (existing) => {
        await ctx.db.patch(existing._id, {
          payload: {
            warning_id: `${warning.doc._id}`,
            trigger_reason: "MISSED_TARGETS",
            source: "seedOpsTargetMissed",
          },
          status: "PENDING",
          updated_at: daysBeforeReference(4),
          is_deleted: false,
        });
      },
    });

    return {
      agent_user_id: ops1._id,
      missed_targets: seededTargets.length,
      warning_id: warning.doc._id,
      check_in_count: preBriefCheckIns.length,
    };
  },
});
