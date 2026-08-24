"use client";

import { cn } from "@/lib/utils";

type IncentiveCardBadgeProps = {
  cardType: string;
  level: string;
  status?: string;
  className?: string;
};

const CARD_TYPE_LABELS: Record<string, string> = {
  lead_milestone: "Lead Milestone",
  visit_milestone: "Visit Milestone",
  quality_streak: "Quality Streak",
  speed_bonus: "Speed Bonus",
  monthly_top: "Monthly Top",
};

const LEVEL_ICONS: Record<string, string> = {
  BRONZE: "🥉",
  SILVER: "🥈",
  GOLD: "🥇",
  PLATINUM: "💎",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  expired: "bg-gray-100 text-gray-600",
  redeemed: "bg-blue-100 text-blue-700",
};

function formatStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function IncentiveCardBadge({
  cardType,
  level,
  status,
  className,
}: IncentiveCardBadgeProps) {
  const cardTypeLabel = CARD_TYPE_LABELS[cardType] ?? cardType;
  const tierIcon = LEVEL_ICONS[level] ?? "🏅";
  const statusKey = status?.toLowerCase();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1",
        className,
      )}
    >
      <span aria-hidden>{tierIcon}</span>
      <span className="text-sm font-medium text-slate-700">
        {level} {cardTypeLabel}
      </span>
      {statusKey ? (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold",
            STATUS_STYLES[statusKey] ?? "bg-slate-200 text-slate-700",
          )}
        >
          {formatStatusLabel(statusKey)}
        </span>
      ) : null}
    </div>
  );
}
