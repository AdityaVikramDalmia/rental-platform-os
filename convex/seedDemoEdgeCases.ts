// Demo data — all values are fictitious. Generated for development and
// open-source demonstration only.
import {
  CHECKLIST_DEPTH,
  CHECKLIST_STATUS,
  QUALITY_FLAGS,
  RM_ASSIGNMENT_STATUS,
  RM_CHECK_IN_METHOD,
  RM_CHECK_IN_OUTCOME,
  RM_CHECK_IN_TYPE,
} from "../lib/constants";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./functions";
import {
  DEMO_EMAILS,
  DEMO_PHONES,
  ensureSeedRecord,
  lookupGuardByPhone,
  lookupOwnerByPhone,
  lookupUserDoc,
} from "./seedHelpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const EDGE_CASE_REFERENCE_TS = Date.UTC(2026, 0, 20, 11, 0, 0);

function daysBeforeReference(days: number): number {
  return EDGE_CASE_REFERENCE_TS - days * DAY_MS;
}

type QualitySnapshot = {
  computed_at: number;
  score: number;
  tier: Doc<"quality_score_history">["tier"];
  trigger: Doc<"quality_score_history">["trigger"];
  components: Doc<"quality_score_history">["components"];
};

export const seedGuardQualityDecline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const guardProfile = await lookupGuardByPhone(ctx, DEMO_PHONES.guard2);
    const guardUserId = guardProfile.user_id;

    const snapshots: QualitySnapshot[] = [
      {
        computed_at: daysBeforeReference(30),
        score: 84,
        tier: "GOLD",
        trigger: "MANUAL_RECALC",
        components: {
          checklist: 92,
          photo: 90,
          speed: 88,
          verification: 95,
          document: 86,
        },
      },
      {
        computed_at: daysBeforeReference(15),
        score: 72,
        tier: "SILVER",
        trigger: "CRON_DAILY",
        components: {
          checklist: 79,
          photo: 75,
          speed: 64,
          verification: 65,
          document: 77,
        },
      },
      {
        computed_at: daysBeforeReference(2),
        score: 64,
        tier: "SILVER",
        trigger: "CRON_DAILY",
        components: {
          checklist: 71,
          photo: 69,
          speed: 48,
          verification: 65,
          document: 67,
        },
      },
    ];

    for (const snapshot of snapshots) {
      await ensureSeedRecord(ctx, {
        label: "quality_score_history",
        lookup: async () =>
          await ctx.db
            .query("quality_score_history")
            .withIndex("by_guard_and_date", (q) =>
              q.eq("guard_user_id", guardUserId).eq("computed_at", snapshot.computed_at),
            )
            .first(),
        create: async () =>
          await ctx.db.insert("quality_score_history", {
            guard_user_id: guardUserId,
            score: snapshot.score,
            components: snapshot.components,
            trigger: snapshot.trigger,
            tier: snapshot.tier,
            computed_at: snapshot.computed_at,
            is_deleted: false,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            score: snapshot.score,
            components: snapshot.components,
            trigger: snapshot.trigger,
            tier: snapshot.tier,
            is_deleted: false,
          });
        },
      });
    }

    if (guardProfile.quality_score !== 64) {
      await ctx.db.patch(guardProfile._id, {
        quality_score: 64,
      });
    }

    const latestGuardLead = await ctx.db
      .query("leads")
      .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", guardUserId))
      .order("desc")
      .first();

    if (latestGuardLead) {
      const existingFlags = latestGuardLead.quality_flags ?? [];
      if (!existingFlags.includes(QUALITY_FLAGS.GUARD_HIGH_REJECTION)) {
        await ctx.db.patch(latestGuardLead._id, {
          quality_flags: [...existingFlags, QUALITY_FLAGS.GUARD_HIGH_REJECTION],
        });
      }
    }

    return {
      guard_user_id: guardUserId,
      lead_accuracy_range: { from: 0.95, to: 0.65 },
      response_time_trend: "increasing",
      tier_progression: ["GOLD", "SILVER"],
      warning_flag: QUALITY_FLAGS.GUARD_HIGH_REJECTION,
    };
  },
});

export const seedRmEscalation = internalMutation({
  args: {},
  handler: async (ctx) => {
    const founder_one = await lookupUserDoc(ctx, DEMO_EMAILS.founder_one);
    const opsUser = await lookupUserDoc(ctx, DEMO_EMAILS.ops1);
    const owner = await lookupOwnerByPhone(ctx, DEMO_PHONES.owner1);

    if (!owner) {
      throw new Error("seedRmEscalation: owner1 not found");
    }

    const fallbackGuard = await lookupGuardByPhone(ctx, DEMO_PHONES.guard2);

    const rmProfileRecord = await ensureSeedRecord(ctx, {
      label: "ops-rm-guard-profile",
      lookup: async () =>
        await ctx.db
          .query("guard_profiles")
          .withIndex("by_user_id", (q) => q.eq("user_id", opsUser._id))
          .first(),
      create: async () =>
        await ctx.db.insert("guard_profiles", {
          user_id: opsUser._id,
          society_id: fallbackGuard.society_id,
          guard_type: "ROVING",
          has_seen_onboarding: true,
          quality_score: 58,
        }),
      patchIfExists: async (existing) => {
        await ctx.db.patch(existing._id, {
          society_id: existing.society_id,
          has_seen_onboarding: true,
        });
      },
    });

    const assignmentCreatedAt = daysBeforeReference(45);
    const warningAt = daysBeforeReference(12);
    const escalatedAt = daysBeforeReference(5);
    const secondCompletedAt = daysBeforeReference(28);
    const thirdMissedAt = daysBeforeReference(6);

    const assignmentRecord = await ensureSeedRecord(ctx, {
      label: "owner-rm-escalation-assignment",
      lookup: async () => {
        const ownerAssignments = await ctx.db
          .query("owner_rm_assignments")
          .withIndex("by_owner", (q) => q.eq("owner_id", owner._id))
          .collect();

        return ownerAssignments.find((assignment) => assignment.rm_user_id === opsUser._id) ?? null;
      },
      create: async () =>
        await ctx.db.insert("owner_rm_assignments", {
          owner_id: owner._id,
          rm_guard_id: rmProfileRecord.doc._id,
          rm_user_id: opsUser._id,
          source_closure_id: undefined,
          assigned_by: "ADMIN",
          assigned_by_admin_id: founder_one._id,
          status: RM_ASSIGNMENT_STATUS.ACTIVE,
          last_check_in_at: secondCompletedAt,
          next_check_in_due: daysBeforeReference(2),
          check_in_frequency_days: 7,
          missed_check_ins_count: 0,
          performance_score: 76,
          sla_breach_count: 0,
          last_sla_breach_at: undefined,
          escalation_level: 0,
          reassigned_at: undefined,
          reassigned_to_guard_id: undefined,
          reassignment_reason: undefined,
          created_at: assignmentCreatedAt,
          updated_at: assignmentCreatedAt,
        }),
      patchIfExists: async (existing) => {
        await ctx.db.patch(existing._id, {
          owner_id: owner._id,
          rm_guard_id: rmProfileRecord.doc._id,
          rm_user_id: opsUser._id,
          assigned_by: "ADMIN",
          assigned_by_admin_id: founder_one._id,
          check_in_frequency_days: 7,
          created_at: assignmentCreatedAt,
        });
      },
    });

    const assignmentId = assignmentRecord.doc._id;

    const checkInSeries: Array<{
      created_at: number;
      summary: string;
      outcome: Doc<"rm_check_ins">["outcome"];
      satisfaction?: number;
    }> = [
      {
        created_at: daysBeforeReference(40),
        summary: "Scheduled RM check-in completed. Owner acknowledged service quality.",
        outcome: RM_CHECK_IN_OUTCOME.RESOLVED,
        satisfaction: 5,
      },
      {
        created_at: secondCompletedAt,
        summary: "Scheduled RM check-in completed. No open concerns reported.",
        outcome: RM_CHECK_IN_OUTCOME.RESOLVED,
        satisfaction: 4,
      },
      {
        created_at: daysBeforeReference(18),
        summary: "Missed scheduled check-in #1. Owner unreachable on call window.",
        outcome: RM_CHECK_IN_OUTCOME.PENDING,
      },
      {
        created_at: daysBeforeReference(12),
        summary: "Missed scheduled check-in #2. Follow-up overdue.",
        outcome: RM_CHECK_IN_OUTCOME.PENDING,
      },
      {
        created_at: thirdMissedAt,
        summary: "Missed scheduled check-in #3. Escalation triggered.",
        outcome: RM_CHECK_IN_OUTCOME.ESCALATED,
      },
    ];

    for (const checkIn of checkInSeries) {
      await ensureSeedRecord(ctx, {
        label: "rm_check_in",
        lookup: async () =>
          await ctx.db
            .query("rm_check_ins")
            .withIndex("by_assignment", (q) => q.eq("assignment_id", assignmentId))
            .filter((q) => q.eq(q.field("summary"), checkIn.summary))
            .first(),
        create: async () =>
          await ctx.db.insert("rm_check_ins", {
            assignment_id: assignmentId,
            owner_id: owner._id,
            rm_guard_id: rmProfileRecord.doc._id,
            check_in_type: RM_CHECK_IN_TYPE.SCHEDULED,
            method: RM_CHECK_IN_METHOD.CALL,
            summary: checkIn.summary,
            outcome: checkIn.outcome,
            owner_satisfaction: checkIn.satisfaction,
            created_at: checkIn.created_at,
          }),
        patchIfExists: async (existing) => {
          await ctx.db.patch(existing._id, {
            outcome: checkIn.outcome,
            owner_satisfaction: checkIn.satisfaction,
            created_at: checkIn.created_at,
          });
        },
      });
    }

    await ctx.db.patch(assignmentId, {
      status: RM_ASSIGNMENT_STATUS.WARNING,
      missed_check_ins_count: 2,
      escalation_level: 1,
      performance_score: 55,
      last_check_in_at: secondCompletedAt,
      next_check_in_due: daysBeforeReference(2),
      updated_at: warningAt,
    });

    await ctx.db.patch(assignmentId, {
      status: RM_ASSIGNMENT_STATUS.ESCALATED,
      missed_check_ins_count: 3,
      escalation_level: 2,
      performance_score: 42,
      sla_breach_count: 3,
      last_sla_breach_at: thirdMissedAt,
      last_check_in_at: secondCompletedAt,
      next_check_in_due: daysBeforeReference(1),
      updated_at: escalatedAt,
    });

    await ctx.db.patch(owner._id, {
      current_rm_id: opsUser._id,
      current_rm_guard_id: rmProfileRecord.doc._id,
      updated_at: EDGE_CASE_REFERENCE_TS,
      last_activity_at: EDGE_CASE_REFERENCE_TS,
    });

    return {
      owner_id: owner._id,
      rm_user_id: opsUser._id,
      assignment_id: assignmentId,
      completed_check_ins: 2,
      missed_check_ins: 3,
      final_status: RM_ASSIGNMENT_STATUS.ESCALATED,
    };
  },
});

export const seedChecklistRevision = internalMutation({
  args: {},
  handler: async (ctx) => {
    const founder_one = await lookupUserDoc(ctx, DEMO_EMAILS.founder_one);
    const guardProfile = await lookupGuardByPhone(ctx, DEMO_PHONES.guard2);
    const guardUserId = guardProfile.user_id;

    const linkedLead = await ctx.db
      .query("leads")
      .withIndex("by_submitted_by_guard_id", (q) => q.eq("submitted_by_guard_id", guardUserId))
      .first();

    if (!linkedLead) {
      throw new Error("seedChecklistRevision: expected at least one lead for guard2");
    }

    const revisionVisitStart = daysBeforeReference(10);
    const revisionVisitEnd = revisionVisitStart + 45 * 60 * 1000;
    const approvedAt = daysBeforeReference(3);

    const revisionVisit = await ensureSeedRecord(ctx, {
      label: "revision-checklist-visit",
      lookup: async () =>
        await ctx.db
          .query("visits")
          .withIndex("by_lead_id", (q) => q.eq("lead_id", linkedLead._id))
          .filter((q) => q.eq(q.field("scheduled_start"), revisionVisitStart))
          .first(),
      create: async () =>
        await ctx.db.insert("visits", {
          lead_id: linkedLead._id,
          society_id: linkedLead.society_id,
          listing_id: undefined,
          scheduled_start: revisionVisitStart,
          scheduled_end: revisionVisitEnd,
          assigned_guard_id: guardUserId,
          status: "COMPLETED",
          outcome: "FOLLOWUP",
          outcome_notes: "Dedicated visit for checklist revision seed scenario",
          started_at: revisionVisitStart + 10 * 60 * 1000,
          completed_at: approvedAt,
          needs_reassignment: undefined,
          checklist_instance_id: undefined,
          tenant_inquiry_id: undefined,
          created_by_admin_id: founder_one._id,
        }),
      patchIfExists: async (existing) => {
        await ctx.db.patch(existing._id, {
          assigned_guard_id: guardUserId,
          status: "COMPLETED",
          completed_at: approvedAt,
          created_by_admin_id: founder_one._id,
        });
      },
    });

    const templateName = "Edge Case Checklist Revision Template";
    const templateDescription =
      "Template for revision-requested checklist cycles in demo edge cases.";

    const template = await ensureSeedRecord(ctx, {
      label: "checklist-revision-template",
      lookup: async () =>
        await ctx.db
          .query("checklist_templates")
          .withIndex("by_name_and_depth", (q) =>
            q.eq("name", templateName).eq("depth", CHECKLIST_DEPTH.FULL),
          )
          .first(),
      create: async () =>
        await ctx.db.insert("checklist_templates", {
          name: templateName,
          description: templateDescription,
          depth: CHECKLIST_DEPTH.FULL,
          is_active: true,
          is_deleted: false,
          sections: [
            {
              section_id: "structure",
              title: "Structure",
              description: "Core structural condition checks",
              items: [
                {
                  item_id: "walls-condition",
                  label: "Walls condition",
                  item_type: "CONDITION",
                  is_required: true,
                  requires_photo: false,
                  min_depth: CHECKLIST_DEPTH.LIGHT,
                },
                {
                  item_id: "main-door-lock",
                  label: "Main door lock operational",
                  item_type: "CHECKBOX",
                  is_required: true,
                  requires_photo: false,
                  min_depth: CHECKLIST_DEPTH.LIGHT,
                },
              ],
            },
            {
              section_id: "notes",
              title: "Revision Notes",
              description: "Reviewer and re-submission context",
              items: [
                {
                  item_id: "revision-summary",
                  label: "Revision summary",
                  item_type: "TEXT",
                  is_required: true,
                  requires_photo: false,
                  min_depth: CHECKLIST_DEPTH.MEDIUM,
                },
              ],
            },
          ],
        }),
      patchIfExists: async (existing) => {
        await ctx.db.patch(existing._id, {
          description: templateDescription,
          is_active: true,
          is_deleted: false,
        });
      },
    });

    const startedAt = daysBeforeReference(9);
    const firstSubmittedAt = daysBeforeReference(8);
    const underReviewAt = daysBeforeReference(7);
    const revisionRequestedAt = daysBeforeReference(6);
    const resubmittedAt = daysBeforeReference(4);

    const checklist = await ensureSeedRecord(ctx, {
      label: "checklist-revision-instance",
      lookup: async () =>
        await ctx.db
          .query("checklist_instances")
          .withIndex("by_visit_id", (q) => q.eq("visit_id", revisionVisit.doc._id))
          .first(),
      create: async () =>
        await ctx.db.insert("checklist_instances", {
          template_id: template.doc._id,
          visit_id: revisionVisit.doc._id,
          assigned_to: guardUserId,
          assigned_by: founder_one._id,
          depth: CHECKLIST_DEPTH.FULL,
          status: CHECKLIST_STATUS.SUBMITTED,
          completeness_score: 72,
          responses: [
            {
              item_id: "walls-condition",
              section_id: "structure",
              value: undefined,
              condition_rating: "GOOD",
              photo_ids: [],
              photo_metadata: [],
              notes: "Initial submission looked acceptable.",
              completed_at: firstSubmittedAt,
            },
            {
              item_id: "main-door-lock",
              section_id: "structure",
              value: "false",
              condition_rating: undefined,
              photo_ids: [],
              photo_metadata: [],
              notes: "Lock status needed re-validation.",
              completed_at: firstSubmittedAt,
            },
          ],
          review_notes: "Initial review pending",
          reviewed_by: undefined,
          reviewed_at: undefined,
          submitted_at: firstSubmittedAt,
          started_at: startedAt,
          is_deleted: false,
        }),
      patchIfExists: async (existing) => {
        await ctx.db.patch(existing._id, {
          template_id: template.doc._id,
          assigned_to: guardUserId,
          assigned_by: founder_one._id,
          depth: CHECKLIST_DEPTH.FULL,
          started_at: startedAt,
          is_deleted: false,
        });
      },
    });

    await ctx.db.patch(checklist.doc._id, {
      status: CHECKLIST_STATUS.UNDER_REVIEW,
      review_notes: "Initial review: lock evidence unclear, please revise and resubmit.",
      reviewed_by: founder_one._id,
      reviewed_at: underReviewAt,
      submitted_at: firstSubmittedAt,
    });

    await ctx.db.patch(checklist.doc._id, {
      status: CHECKLIST_STATUS.REVISION_REQUESTED,
      review_notes: "Revision requested: confirm lock functionality and update revision summary.",
      reviewed_by: founder_one._id,
      reviewed_at: revisionRequestedAt,
    });

    await ctx.db.patch(checklist.doc._id, {
      status: CHECKLIST_STATUS.IN_PROGRESS,
    });

    await ctx.db.patch(checklist.doc._id, {
      status: CHECKLIST_STATUS.SUBMITTED,
      completeness_score: 100,
      responses: [
        {
          item_id: "walls-condition",
          section_id: "structure",
          value: undefined,
          condition_rating: "GOOD",
          photo_ids: [],
          photo_metadata: [],
          notes: "No new wall defects observed.",
          completed_at: resubmittedAt,
        },
        {
          item_id: "main-door-lock",
          section_id: "structure",
          value: "true",
          condition_rating: undefined,
          photo_ids: [],
          photo_metadata: [],
          notes: "Revalidated during revisit: lock now works correctly.",
          completed_at: resubmittedAt,
        },
        {
          item_id: "revision-summary",
          section_id: "notes",
          value:
            "Resubmitted after revision request. Updated lock status and clarified corrective action.",
          condition_rating: undefined,
          photo_ids: [],
          photo_metadata: [],
          notes: "Reviewer requested clearer revision summary.",
          completed_at: resubmittedAt,
        },
      ],
      submitted_at: resubmittedAt,
    });

    await ctx.db.patch(checklist.doc._id, {
      status: CHECKLIST_STATUS.UNDER_REVIEW,
      reviewed_by: founder_one._id,
      reviewed_at: approvedAt - DAY_MS / 2,
    });

    await ctx.db.patch(checklist.doc._id, {
      status: CHECKLIST_STATUS.APPROVED,
      review_notes:
        "Approved after revision cycle. Initial revision request closed after successful resubmission.",
      reviewed_by: founder_one._id,
      reviewed_at: approvedAt,
    });

    await ctx.db.patch(revisionVisit.doc._id, {
      checklist_instance_id: checklist.doc._id,
      completed_at: approvedAt,
      status: "COMPLETED",
    });

    return {
      template_id: template.doc._id,
      checklist_instance_id: checklist.doc._id,
      visit_id: revisionVisit.doc._id,
      final_status: CHECKLIST_STATUS.APPROVED,
      cycle: [
        CHECKLIST_STATUS.SUBMITTED,
        CHECKLIST_STATUS.UNDER_REVIEW,
        CHECKLIST_STATUS.REVISION_REQUESTED,
        CHECKLIST_STATUS.SUBMITTED,
        CHECKLIST_STATUS.APPROVED,
      ],
    };
  },
});
