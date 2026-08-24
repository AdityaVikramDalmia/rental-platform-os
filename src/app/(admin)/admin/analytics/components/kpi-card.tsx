"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  subLabel?: string;
  trend?: "up" | "down" | "flat" | null;
  trendColorInverted?: boolean;
};

function getTrendUi(
  trend: "up" | "down" | "flat" | null | undefined,
  trendColorInverted: boolean,
): {
  icon: typeof TrendingUp | typeof TrendingDown | typeof Minus;
  className: string;
  label: string;
} {
  if (trend === "flat" || trend === null || trend === undefined) {
    return {
      icon: Minus,
      className: "text-slate-500",
      label: "Stable",
    };
  }

  if (trend === "up") {
    return {
      icon: TrendingUp,
      className: trendColorInverted ? "text-red-600" : "text-green-600",
      label: "Up",
    };
  }

  return {
    icon: TrendingDown,
    className: trendColorInverted ? "text-green-600" : "text-red-600",
    label: "Down",
  };
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  subLabel,
  trend,
  trendColorInverted = false,
}: KpiCardProps) {
  const trendUi = getTrendUi(trend, trendColorInverted);
  const TrendIcon = trendUi.icon;

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="inline-flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Icon className="size-4" />
          </div>

          {trend !== undefined ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                trendUi.className,
              )}
            >
              <TrendIcon className="size-3.5" />
              {trendUi.label}
            </span>
          ) : null}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          {subLabel ? <p className="text-xs text-slate-500">{subLabel}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
