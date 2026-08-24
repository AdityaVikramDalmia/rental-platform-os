"use client";

import { useQuery } from "convex/react";
import { Trophy } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { getLevelFromTotalXp } from "../../../convex/gamification";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const TIER_STYLE: Record<string, { bg: string; text: string }> = {
  BRONZE: { bg: "bg-amber-100", text: "text-amber-700" },
  SILVER: { bg: "bg-gray-200", text: "text-gray-700" },
  GOLD: { bg: "bg-yellow-100", text: "text-yellow-700" },
  PLATINUM: { bg: "bg-cyan-100", text: "text-cyan-700" },
};

function titleCase(str: string): string {
  return str
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function LoadingSkeleton() {
  return (
    <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <Skeleton className="h-6 w-44" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

export function GamificationProfileCard() {
  const profile = useQuery(api.gamification.getMyProfile);

  if (profile === undefined) {
    return <LoadingSkeleton />;
  }

  if (profile === null) {
    return (
      <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <Trophy className="size-4.5 text-slate-500" />
            Gamification
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">
            No gamification profile yet — earn XP by completing leads, visits, and closures.
          </div>
        </CardContent>
      </Card>
    );
  }

  const levelState = getLevelFromTotalXp(profile.xp_total);
  const tierStyle = TIER_STYLE[profile.weekly_tier] ?? TIER_STYLE.BRONZE;
  const progressPct = Math.min(100, Math.max(0, levelState.progressPercent));

  return (
    <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-slate-900">
          <Trophy className="size-4.5 text-emerald-600" />
          Gamification
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="rounded-lg bg-emerald-50 p-3">
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold text-slate-900">Level {levelState.level}</p>
            <p className="text-xs font-medium text-emerald-600">{Math.round(progressPct)}%</p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {levelState.xpInCurrentLevel.toLocaleString()} / {levelState.xpToNext.toLocaleString()}{" "}
            XP
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Weekly Tier
            </p>
            <Badge className={`mt-1.5 ${tierStyle.bg} ${tierStyle.text} text-[11px]`}>
              {profile.weekly_tier}
            </Badge>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Weekly XP</p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">
              {profile.weekly_xp.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Streak</p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">{profile.streak_days} days 🔥</p>
            <p className="text-[11px] text-slate-400">Longest: {profile.longest_streak}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Freezes</p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">
              {profile.streak_freezes_remaining}
            </p>
            <p className="text-[11px] text-slate-400">remaining</p>
          </div>
        </div>

        {profile.badges.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Badges</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {profile.badges.map((badge) => (
                <Badge key={badge} className="shrink-0 bg-violet-100 text-[11px] text-violet-700">
                  {titleCase(badge)}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
