import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "daily-analytics-snapshot",
  { hourUTC: 19, minuteUTC: 0 },
  internal.analytics.computeDailySnapshot,
);

crons.daily(
  "compute-target-actuals",
  { hourUTC: 20, minuteUTC: 0 },
  internal.opsManagement.computeTargetActuals,
);

crons.daily(
  "auto-detect-warnings",
  { hourUTC: 21, minuteUTC: 0 },
  internal.opsManagement.autoDetectWarnings,
);

crons.daily(
  "auto-expire-warnings",
  { hourUTC: 21, minuteUTC: 30 },
  internal.opsManagement.autoExpireWarnings,
);

crons.daily(
  "checkin-overdue-nudge",
  { hourUTC: 8, minuteUTC: 0 },
  internal.opsManagement.checkinOverdueNudge,
);

crons.daily(
  "streak-validation",
  { hourUTC: 18, minuteUTC: 45 },
  internal.incentives.validateStreaks,
);

crons.daily(
  "rm-sla-check-in-breaches",
  { hourUTC: 0, minuteUTC: 30 },
  internal.rmAssignments.processSlaBreach,
);

crons.daily(
  "owner-lifecycle-dormancy",
  { hourUTC: 1, minuteUTC: 30 },
  internal.owners.transitionDormantOwners,
);

crons.daily(
  "expire-owner-invites",
  { hourUTC: 2, minuteUTC: 0 },
  internal.ownerInvites.expireStaleInvites,
);

crons.daily(
  "check-stale-negotiations",
  { hourUTC: 2, minuteUTC: 10 },
  internal.negotiations.checkStaleNegotiations,
);

crons.daily(
  "check-token-without-agreement",
  { hourUTC: 2, minuteUTC: 20 },
  internal.negotiations.checkTokenWithoutAgreement,
);

crons.daily(
  "check-excessive-negotiation-rounds",
  { hourUTC: 2, minuteUTC: 25 },
  internal.negotiations.checkExcessiveRoundsCron,
);

crons.daily(
  "rm-escalation-automation",
  { hourUTC: 2, minuteUTC: 30 },
  internal.rmAssignments.escalateWarnings,
);

crons.daily(
  "regulatory-sla-audit",
  { hourUTC: 3, minuteUTC: 0 },
  internal.societyLiaison.auditSlaBreaches,
);

crons.daily(
  "rm-performance-score-calc",
  { hourUTC: 23, minuteUTC: 30 },
  internal.rmAssignments.recalculatePerformanceScores,
);

crons.daily(
  "freshness-badge-update",
  { hourUTC: 18, minuteUTC: 35 },
  internal.trustBadges.recomputeFreshness,
  {},
);

crons.interval("expire-tenant-bounties", { hours: 1 }, internal.tenantInquiries.expireBounties, {});

crons.interval(
  "expire-stale-rental-agreements",
  { hours: 1 },
  internal.rentalTransactions.expireStaleAgreements,
  {},
);

crons.interval(
  "auto-timeout-rental-transactions",
  { hours: 1 },
  internal.rentalTransactions.autoTimeoutTransactions,
  {},
);

crons.interval(
  "recover-stale-chat-batches",
  { minutes: 5 },
  internal.chatBatching.recoverStaleBatches,
  {},
);

crons.interval("process-notification-queue", { minutes: 1 }, internal.notifications.processQueue, {
  limit: 50,
});

crons.interval("retry-failed-notifications", { minutes: 2 }, internal.notifications.retryFailed, {
  limit: 50,
});

crons.interval(
  "recover-stale-notification-processing",
  { minutes: 2 },
  internal.notifications.recoverStaleProcessing,
  {
    limit: 50,
  },
);

crons.daily(
  "gamification-weekly-tier-recalc",
  { hourUTC: 18, minuteUTC: 30 },
  internal.gamification.recalculateWeeklyTiers,
);

crons.daily(
  "gamification-daily-quest-reset",
  { hourUTC: 18, minuteUTC: 32 },
  internal.gamification.resetDailyQuests,
);

crons.daily(
  "gamification-daily-streak-check",
  { hourUTC: 18, minuteUTC: 34 },
  internal.gamification.checkDailyStreaks,
);

crons.daily(
  "gamification-monthly-freeze-refill",
  { hourUTC: 18, minuteUTC: 36 },
  internal.gamification.refillMonthlyFreezes,
);

export default crons;
