"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type QualityTier } from "../../../lib/constants";

const TIER_I18N_KEY: Record<string, string> = {
  BRONZE: "bronze",
  SILVER: "silver",
  GOLD: "gold",
  PLATINUM: "platinum",
};

const TIER_RING_COLORS: Record<string, string> = {
  BRONZE: "#f59e0b",
  SILVER: "#9ca3af",
  GOLD: "#eab308",
  PLATINUM: "#3b82f6",
};

const TIER_BADGE_CLASSES: Record<string, string> = {
  BRONZE: "border-amber-300 bg-amber-50 text-amber-700",
  SILVER: "border-slate-300 bg-slate-50 text-slate-700",
  GOLD: "border-yellow-300 bg-yellow-50 text-yellow-700",
  PLATINUM: "border-blue-300 bg-blue-50 text-blue-700",
};

type QualityScoreGaugeProps = {
  score: number | undefined;
  tier: QualityTier;
};

export function QualityScoreGauge({ score, tier }: QualityScoreGaugeProps) {
  const t = useTranslations("guard.quality");

  if (score === undefined) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="size-[140px] rounded-full" />
        <Skeleton className="h-5 w-16" />
      </div>
    );
  }

  const size = 140;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const dashOffset = circumference - (clampedScore / 100) * circumference;
  const ringColor = TIER_RING_COLORS[tier] ?? TIER_RING_COLORS.BRONZE;
  const badgeClass = TIER_BADGE_CLASSES[tier] ?? TIER_BADGE_CLASSES.BRONZE;
  const tierKey = TIER_I18N_KEY[tier] ?? "bronze";
  const tierLabel = t(tierKey);

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={`${t("title")}: ${Math.round(clampedScore)}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-slate-900 tabular-nums">
            {Math.round(clampedScore)}
          </span>
          <span className="text-xs text-slate-500">{t("title")}</span>
        </div>
      </div>
      <Badge variant="outline" className={`text-xs font-medium ${badgeClass}`}>
        {tierLabel}
      </Badge>
      <p className="text-xs text-slate-500">
        {t("tier")}: {tierLabel}
      </p>
    </div>
  );
}
