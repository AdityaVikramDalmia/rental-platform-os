"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "../../../../../convex/_generated/api";
import { signOutAction } from "@/app/actions/auth";
import { GuardLeaderboardPosition } from "@/components/guard/guard-leaderboard-position";
import { GuardStreaksCard } from "@/components/guard/guard-streaks-card";
import { QualityScoreGauge } from "@/components/guard/quality-score-gauge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isFieldWorkerUserType,
  QUALITY_TIER,
  type QualityTier,
} from "../../../../../lib/constants";

type QualitySnapshot = {
  quality_score: number | undefined;
  tier: QualityTier;
  streaks: Array<{
    streak_type: string;
    current_count: number;
    longest_count: number;
    is_active: boolean;
    last_activity_date: string;
    next_milestone: number | null;
    next_milestone_bonus_paise: number;
  }>;
  recent_history: Array<{
    score: number;
    tier: string;
    trigger: string;
    computed_at: number;
  }>;
  total_completed_tasks: number;
};

export default function GuardDashboardPage() {
  const t = useTranslations("guard.dashboard");
  const currentUser = useQuery(api.users.getCurrentUser);
  const qualitySnapshot = useQuery(api.incentives.getMyQualitySnapshot);

  if (currentUser === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !isFieldWorkerUserType(currentUser.user_type)) {
    return null;
  }

  return (
    <div className="space-y-4 text-base">
      <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl text-slate-900">
            {t("welcome", { name: currentUser.name })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-slate-600">{t("loggedInAs", { name: currentUser.name })}</p>
          <form action={signOutAction}>
            <Button
              type="submit"
              variant="outline"
              className="h-11 min-h-11 min-w-11 rounded-lg px-4"
            >
              {t("signOut")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <QualityDashboardSection qualitySnapshot={qualitySnapshot} />
    </div>
  );
}

function QualityDashboardSection({
  qualitySnapshot,
}: {
  qualitySnapshot: QualitySnapshot | undefined;
}) {
  if (qualitySnapshot === undefined) {
    return (
      <div className="space-y-4">
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardContent className="py-6">
            <div className="flex justify-center">
              <Skeleton className="size-[148px] rounded-full" />
            </div>
          </CardContent>
        </Card>
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  const tier = qualitySnapshot.tier ?? QUALITY_TIER.BRONZE;

  return (
    <div className="space-y-4">
      <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
        <CardContent className="py-6">
          <QualityScoreGauge score={qualitySnapshot.quality_score} tier={tier} />
        </CardContent>
      </Card>

      <GuardStreaksCard streaks={qualitySnapshot.streaks} />

      <GuardLeaderboardPosition />

      <QualityHistoryCard history={qualitySnapshot.recent_history} />
    </div>
  );
}

const TRIGGER_I18N_KEY: Record<string, string> = {
  CHECKLIST_APPROVED: "triggerChecklist",
  VISIT_COMPLETED: "triggerVisit",
  DOCUMENTS_UPDATED: "triggerDocuments",
  MANUAL_RECALC: "triggerManual",
  CRON_DAILY: "triggerDaily",
};

function QualityHistoryCard({ history }: { history: QualitySnapshot["recent_history"] }) {
  const t = useTranslations("guard.quality");

  return (
    <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">{t("recentHistory")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">{t("noHistory")}</p>
        ) : (
          <>
            <div className="flex items-end gap-1 rounded-lg bg-slate-50 px-3 py-2">
              {history
                .slice()
                .reverse()
                .map((entry) => (
                  <div
                    key={`spark-${entry.computed_at}`}
                    className="h-8 flex-1 rounded-sm bg-amber-400/70"
                    style={{ height: `${Math.max(18, Math.min(100, entry.score))}%` }}
                    aria-hidden="true"
                  />
                ))}
            </div>

            <div className="space-y-2">
              {history.map((entry) => {
                const triggerKey = TRIGGER_I18N_KEY[entry.trigger];
                const triggerLabel = triggerKey ? t(triggerKey) : entry.trigger;

                return (
                  <div
                    key={entry.computed_at}
                    className="flex min-h-11 items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {Math.round(entry.score)} / 100
                      </p>
                      <p className="text-xs text-slate-500">{triggerLabel}</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      {new Date(entry.computed_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
