"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../../convex/_generated/api";

const TIER_I18N_KEY: Record<string, string> = {
  BRONZE: "bronze",
  SILVER: "silver",
  GOLD: "gold",
  PLATINUM: "platinum",
};

function formatRank(rank: number | null | undefined): string {
  if (rank === null || rank === undefined || rank <= 0) {
    return "--";
  }

  return `#${rank}`;
}

export function GuardLeaderboardPosition() {
  const t = useTranslations("guard.quality");
  const data = useQuery(api.incentives.getMyLeaderboardPosition, { scope: "WEEKLY" });

  return (
    <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">{t("leaderboard")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-4 w-44" />
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-800">
              {t("daily")}: {formatRank(data.daily_rank)} | {t("weekly")}:{" "}
              {formatRank(data.weekly_rank)} | {t("monthly")}: {formatRank(data.monthly_rank)}
            </p>
            <p className="text-xs text-slate-500">
              {t("score")} {Math.round(data.quality_score)} (
              {t(TIER_I18N_KEY[data.tier] ?? "bronze")}) -{" "}
              {t("completedTasks", { count: data.tasks_completed })}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
