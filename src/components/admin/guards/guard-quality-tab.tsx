"use client";

import { useQuery } from "convex/react";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { FingerprintHistory } from "@/components/admin/guards/fingerprint-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";

const TIME_WINDOW_OPTIONS = [
  { value: "all_time", label: "All Time" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_7_days", label: "Last 7 Days" },
] as const;

type TimeWindow = (typeof TIME_WINDOW_OPTIONS)[number]["value"];

type MetricCardProps = {
  label: string;
  value: string;
  muted?: boolean;
};

function isTimeWindow(value: string): value is TimeWindow {
  return TIME_WINDOW_OPTIONS.some((option) => option.value === value);
}

function formatCount(value: number): string {
  return value.toLocaleString("en-IN");
}

function formatRate(value: number | null): string {
  if (value === null) {
    return "Insufficient data";
  }

  return `${value.toFixed(1)}%`;
}

function MetricCard({ label, value, muted = false }: MetricCardProps) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={
            muted ? "text-base font-medium text-slate-500" : "text-2xl font-semibold text-slate-900"
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

type GuardQualityTabProps = {
  guardUserId: Id<"users">;
};

export function GuardQualityTab({ guardUserId }: GuardQualityTabProps) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("all_time");
  const metrics = useQuery(api.guards.getMetrics, {
    guard_user_id: guardUserId,
    time_window: timeWindow,
  });

  if (metrics === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const hasInsufficientData = metrics.total_submitted < 5;
  const hasHighRejection = metrics.rejection_rate !== null && metrics.rejection_rate > 50;
  const qualityScore = metrics.quality_score;

  return (
    <div className="space-y-4">
      {hasHighRejection ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          <AlertTriangle className="size-4" />
          <span>⚠️ High rejection rate</span>
        </div>
      ) : null}

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">Time Window</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={timeWindow}
            onValueChange={(value) => {
              if (isTimeWindow(value)) {
                setTimeWindow(value);
              }
            }}
            className="grid gap-2 sm:grid-cols-3"
          >
            {TIME_WINDOW_OPTIONS.map((option) => {
              const isSelected = timeWindow === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <RadioGroupItem value={option.value} className="sr-only" />
                  {option.label}
                </label>
              );
            })}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-600">Quality Score</CardTitle>
        </CardHeader>
        <CardContent>
          {hasInsufficientData || qualityScore === null ? (
            <p className="text-base font-medium text-slate-500">Insufficient data</p>
          ) : (
            <p className="text-3xl font-semibold tabular-nums text-slate-900">
              {qualityScore.toFixed(1)}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Lead Metrics</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total Submitted" value={formatCount(metrics.total_submitted)} />
          <MetricCard label="Verified" value={formatCount(metrics.verified_count)} />
          <MetricCard label="Rejected" value={formatCount(metrics.rejected_count)} />
          <MetricCard label="Duplicate" value={formatCount(metrics.duplicate_count)} />
          <MetricCard
            label="Verified Rate"
            value={formatRate(metrics.verified_rate)}
            muted={hasInsufficientData}
          />
          <MetricCard
            label="Rejection Rate"
            value={formatRate(metrics.rejection_rate)}
            muted={hasInsufficientData}
          />
          <MetricCard
            label="Duplicate Rate"
            value={formatRate(metrics.duplicate_rate)}
            muted={hasInsufficientData}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Visit Metrics</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label="Completed Visits" value={formatCount(metrics.completed_visits)} />
          <MetricCard label="No Show" value={formatCount(metrics.no_show_count)} />
          <MetricCard
            label="Visit Completion Rate"
            value={formatRate(metrics.visit_completion_rate)}
            muted={hasInsufficientData}
          />
        </div>
      </div>

      {hasInsufficientData ? (
        <p className="text-sm text-slate-500">
          Insufficient data. Requires at least 5 lead submissions.
        </p>
      ) : null}

      <FingerprintHistory guardUserId={guardUserId} />
    </div>
  );
}
