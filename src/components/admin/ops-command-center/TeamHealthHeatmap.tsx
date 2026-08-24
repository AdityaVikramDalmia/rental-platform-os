"use client";

import { useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { WarningBadge } from "@/components/admin/ops-command-center/WarningBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type TeamHealthHeatmapProps = {
  action?: (userId: Id<"users">) => void;
};

const HEALTH_STYLE_MAP = {
  RED: {
    border: "border-l-red-500",
    tint: "bg-red-50/50",
    badge: "bg-red-100 text-red-700",
  },
  YELLOW: {
    border: "border-l-amber-500",
    tint: "bg-amber-50/50",
    badge: "bg-amber-100 text-amber-700",
  },
  GREEN: {
    border: "border-l-emerald-500",
    tint: "bg-emerald-50/50",
    badge: "bg-emerald-100 text-emerald-700",
  },
} as const;

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "N/A";
  }

  return `${value.toFixed(1)}%`;
}

function formatDelta(value: number | null | undefined, suffix = "%"): string {
  if (value === null || value === undefined) {
    return "Delta: N/A";
  }

  const sign = value > 0 ? "+" : "";
  return `Delta: ${sign}${value.toFixed(1)}${suffix}`;
}

export function TeamHealthHeatmap({ action }: TeamHealthHeatmapProps) {
  const heatmap = useQuery(api.opsManagement.getTeamHealthHeatmap);

  if (heatmap === undefined) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["skeleton-a", "skeleton-b", "skeleton-c"].map((key) => (
          <Card key={key} className="rounded-xl border border-slate-200 bg-white">
            <CardHeader className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (heatmap.length === 0) {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardContent className="py-6 text-sm text-slate-600">
          No active OPS agents found.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {heatmap.map((agent) => {
        const healthStyle = HEALTH_STYLE_MAP[agent.health_color];
        const highestWarningLevel =
          agent.warning_level_breakdown.level3 > 0
            ? 3
            : agent.warning_level_breakdown.level2 > 0
              ? 2
              : agent.warning_level_breakdown.level1 > 0
                ? 1
                : null;

        return (
          <Card
            key={agent.user_id}
            className={cn(
              "rounded-xl border border-slate-200 border-l-4 bg-white",
              healthStyle.border,
              healthStyle.tint,
            )}
          >
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base text-slate-900">{agent.name}</CardTitle>
                <div className="flex items-center gap-1.5">
                  {highestWarningLevel ? (
                    <WarningBadge
                      level={highestWarningLevel}
                      count={agent.active_warning_count}
                      compact
                    />
                  ) : null}
                  <Badge className={healthStyle.badge}>{agent.health_color}</Badge>
                </div>
              </div>
              <p className="text-xs text-slate-500">{agent.phone ?? "Phone not available"}</p>
            </CardHeader>

            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <p>
                  Quality:{" "}
                  <span className="font-semibold text-slate-900">
                    {formatPercent(agent.quality_score)}
                  </span>
                </p>
                <p>
                  Targets:{" "}
                  <span className="font-semibold text-slate-900">
                    {formatPercent(agent.target_hit_rate)}
                  </span>
                </p>
                <p>
                  Warnings:{" "}
                  <span className="font-semibold text-slate-900">{agent.active_warning_count}</span>
                </p>
                <p>
                  Check-in:{" "}
                  <span className="font-semibold text-slate-900">
                    {agent.days_since_last_check_in ?? "N/A"}d
                  </span>
                </p>
              </div>

              <p className="text-xs text-slate-500">
                Levels L1/L2/L3: {agent.warning_level_breakdown.level1}/
                {agent.warning_level_breakdown.level2}/{agent.warning_level_breakdown.level3}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-slate-300 text-slate-700">
                  Caseload: {agent.active_caseload}
                </Badge>
                {agent.is_overloaded ? (
                  <Badge className="bg-red-100 text-red-700">⚠ Overloaded</Badge>
                ) : null}
              </div>

              <div className="space-y-1 text-xs text-slate-500">
                <p>{formatDelta(agent.quality_score_delta_pct)}</p>
                <p>{formatDelta(agent.target_hit_rate_delta_pct)}</p>
                <p>{formatDelta(agent.active_caseload_delta, "")}</p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {agent.health_reasons.map((reason) => (
                  <Badge
                    key={`${agent.user_id}-${reason}`}
                    variant="outline"
                    className="text-xs text-slate-700"
                  >
                    {reason}
                  </Badge>
                ))}
              </div>

              {action ? (
                <Button type="button" className="w-full" onClick={() => action(agent.user_id)}>
                  View Profile
                </Button>
              ) : (
                <p className="text-xs text-slate-500">
                  Switch to Ops Head view for drill-down controls.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
