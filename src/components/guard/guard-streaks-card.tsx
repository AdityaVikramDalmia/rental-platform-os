"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "../../../lib/money";
import { STREAK_TYPE } from "../../../lib/constants";

type StreakData = {
  streak_type: string;
  current_count: number;
  longest_count: number;
  is_active: boolean;
  last_activity_date: string;
  next_milestone?: number | null;
  next_milestone_bonus_paise?: number;
};

type GuardStreaksCardProps = {
  streaks: StreakData[];
};

const STREAK_ICONS: Record<string, string> = {
  [STREAK_TYPE.DAILY_ACTIVE]: "\uD83D\uDD25",
  [STREAK_TYPE.WEEKLY_WARRIOR]: "\u26A1",
  [STREAK_TYPE.QUALITY_CHAIN]: "\u2B50",
  [STREAK_TYPE.PERFECT_10]: "\uD83D\uDC8E",
};

const STREAK_I18N_KEY: Record<string, string> = {
  [STREAK_TYPE.DAILY_ACTIVE]: "dailyActive",
  [STREAK_TYPE.WEEKLY_WARRIOR]: "weeklyWarrior",
  [STREAK_TYPE.QUALITY_CHAIN]: "qualityChain",
  [STREAK_TYPE.PERFECT_10]: "perfect10",
};

export function GuardStreaksCard({ streaks }: GuardStreaksCardProps) {
  const t = useTranslations("guard.quality");
  const activeStreaks = streaks.filter((streak) => streak.is_active && streak.current_count > 0);

  return (
    <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">{t("streaks")}</CardTitle>
      </CardHeader>
      <CardContent>
        {activeStreaks.length === 0 ? (
          <p className="text-sm text-slate-500">{t("noStreaks")}</p>
        ) : (
          <div className="space-y-2">
            {activeStreaks.map((streak) => {
              const icon = STREAK_ICONS[streak.streak_type] ?? "\u2B50";
              const i18nKey = STREAK_I18N_KEY[streak.streak_type] ?? "dailyActive";
              const label = t(i18nKey, { count: streak.current_count });
              const nextMilestoneHint =
                streak.next_milestone === null || streak.next_milestone === undefined
                  ? t("topMilestoneReached")
                  : t("nextMilestone", {
                      count: streak.next_milestone,
                      bonus: formatINR(streak.next_milestone_bonus_paise ?? 0),
                    });

              return (
                <div
                  key={streak.streak_type}
                  className="flex min-h-11 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg" role="img" aria-hidden="true">
                      {icon}
                    </span>
                    <p className="text-sm font-medium text-slate-800">{label}</p>
                  </div>
                  <p className="text-xs text-slate-500">{nextMilestoneHint}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
