"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type PreCheckInBriefProps = {
  agentId: Id<"users">;
  agentName: string;
  onStartCheckInAction: () => void;
};

const WARNING_LEVEL_STYLES = {
  1: "bg-amber-100 text-amber-800",
  2: "bg-orange-100 text-orange-800",
  3: "bg-red-100 text-red-800",
} as const;

const QUALITY_STYLES = {
  HIGH: "text-emerald-700",
  MEDIUM: "text-amber-700",
  LOW: "text-red-700",
  NONE: "text-slate-500",
} as const;

const METRIC_CONFIG = [
  { key: "leads_submitted", label: "Leads Submitted" },
  { key: "leads_verified", label: "Leads Verified" },
  { key: "visits_completed", label: "Visits Completed" },
  { key: "closures_confirmed", label: "Closures Confirmed" },
] as const;

type MetricKey = (typeof METRIC_CONFIG)[number]["key"];

function formatDate(timestamp: number | null): string {
  if (timestamp === null) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatWarningTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function getDeltaBadgeClass(delta: number): string {
  if (delta > 0) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (delta < 0) {
    return "bg-red-100 text-red-700";
  }

  return "bg-slate-100 text-slate-700";
}

function getQualityTone(score: number | null): keyof typeof QUALITY_STYLES {
  if (score === null) {
    return "NONE";
  }

  if (score >= 75) {
    return "HIGH";
  }

  if (score >= 60) {
    return "MEDIUM";
  }

  return "LOW";
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return `${Math.max(0, value).toFixed(1)}%`;
}

export function PreCheckInBrief({
  agentId,
  agentName,
  onStartCheckInAction,
}: PreCheckInBriefProps) {
  const brief = useQuery(api.opsManagement.getPreCheckInBrief, {
    agent_user_id: agentId,
  });

  const qualityTone = useMemo(
    () => getQualityTone(brief?.quality_score ?? null),
    [brief?.quality_score],
  );

  if (brief === undefined) {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Preparing brief...</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border border-slate-200 bg-white">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base text-slate-900">Pre Check-In Brief: {agentName}</CardTitle>
        <p className="text-xs text-slate-500">
          Performance context, risk signals, and open commitments before starting the 1:1.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h4 className="text-sm font-semibold text-slate-900">Performance Delta</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {METRIC_CONFIG.map((metric) => {
              const current = brief.performance_delta.current_7d[metric.key as MetricKey];
              const previous = brief.performance_delta.previous_7d[metric.key as MetricKey];
              const delta = brief.performance_delta.delta[metric.key as MetricKey];
              const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";

              return (
                <div key={metric.key} className="rounded-md border border-slate-200 bg-white p-2">
                  <p className="text-xs font-medium text-slate-700">{metric.label}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-xs text-slate-600">
                      {current} vs {previous}
                    </p>
                    <Badge className={getDeltaBadgeClass(delta)}>
                      {arrow} {delta > 0 ? `+${delta}` : delta}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h4 className="text-sm font-semibold text-slate-900">Open Commitments</h4>
          {brief.open_commitments.length === 0 ? (
            <p className="text-sm text-slate-600">
              No open commitments from the previous check-in.
            </p>
          ) : (
            <div className="space-y-2">
              {brief.open_commitments.map((item, index) => (
                <div
                  key={`${item.description}-${index + 1}`}
                  className="rounded-md border border-slate-200 bg-slate-50 p-2"
                >
                  <p className="text-sm text-slate-900">{item.description}</p>
                  <p className="mt-1 text-xs text-slate-500">Due: {formatDate(item.due_date)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h4 className="text-sm font-semibold text-slate-900">Active Risks</h4>
          {brief.active_warnings.length === 0 ? (
            <p className="text-sm text-slate-600">No active warnings.</p>
          ) : (
            <div className="space-y-2">
              {brief.active_warnings.map((warning, index) => (
                <div
                  key={`${warning.reason}-${warning.created_at}-${index + 1}`}
                  className="rounded-md border border-slate-200 bg-slate-50 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      className={
                        WARNING_LEVEL_STYLES[warning.level as keyof typeof WARNING_LEVEL_STYLES] ??
                        "bg-red-100 text-red-800"
                      }
                    >
                      L{warning.level}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {formatWarningTimestamp(warning.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">{warning.reason}</p>
                  <p className="text-xs text-slate-600">{warning.description}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h4 className="text-sm font-semibold text-slate-900">Target Progress</h4>
          {brief.target_progress.length === 0 ? (
            <p className="text-sm text-slate-600">No active targets.</p>
          ) : (
            <div className="space-y-2">
              {brief.target_progress.map((target) => {
                const progress = target.progress_pct ?? 0;
                const clamped = Math.min(Math.max(progress, 0), 100);
                const barColor =
                  progress >= 80
                    ? "bg-emerald-500"
                    : progress >= 50
                      ? "bg-amber-500"
                      : "bg-red-500";

                return (
                  <div
                    key={`${target.metric}-${target.target_value}`}
                    className="rounded-md border border-slate-200 bg-slate-50 p-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-700">
                      <span>{target.metric}</span>
                      <span>
                        {target.actual_value ?? 0}/{target.target_value}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={cn("h-full rounded-full", barColor)}
                        style={{ width: `${clamped}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-xs text-slate-600">
                      {formatPercent(target.progress_pct)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-600">Active Leads</p>
            <p className="text-lg font-semibold text-slate-900">
              {brief.pipeline_snapshot.active_leads}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-600">Active Visits</p>
            <p className="text-lg font-semibold text-slate-900">
              {brief.pipeline_snapshot.active_visits}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-600">Active Negotiations</p>
            <p className="text-lg font-semibold text-slate-900">
              {brief.pipeline_snapshot.active_negotiations}
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h4 className="text-sm font-semibold text-slate-900">Quality Score</h4>
          <p className={cn("mt-1 text-2xl font-semibold", QUALITY_STYLES[qualityTone])}>
            {brief.quality_score === null ? "N/A" : brief.quality_score.toFixed(1)}
          </p>
        </section>

        <div className="flex justify-end">
          <Button type="button" onClick={onStartCheckInAction}>
            Start Check-In
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
