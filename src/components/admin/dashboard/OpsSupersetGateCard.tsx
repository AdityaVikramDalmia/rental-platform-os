"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TimeWindow } from "@/app/(admin)/admin/analytics/page";

type GateState = "PASS" | "FAIL" | "PENDING";

function getGateState(pass: boolean): GateState {
  return pass ? "PASS" : "FAIL";
}

function GateBadge({ state }: { state: GateState }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-xs font-semibold",
        state === "PASS" && "bg-emerald-100 text-emerald-700",
        state === "FAIL" && "bg-rose-100 text-rose-700",
        state === "PENDING" && "bg-amber-100 text-amber-700",
      )}
    >
      {state === "PASS" ? "PASS" : state === "FAIL" ? "FAIL" : "PENDING"}
    </Badge>
  );
}

function RolloutStateBadge({ state }: { state: "DISABLED" | "CANARY" | "ENABLED" }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-xs font-semibold",
        state === "DISABLED" && "bg-slate-100 text-slate-700",
        state === "CANARY" && "bg-amber-100 text-amber-700",
        state === "ENABLED" && "bg-blue-100 text-blue-700",
      )}
    >
      {state}
    </Badge>
  );
}

type OpsSupersetGateCardProps = {
  timeWindow: TimeWindow;
};

export function OpsSupersetGateCard({ timeWindow }: OpsSupersetGateCardProps) {
  const metrics = useQuery(api.analytics.getOpsSupersetGateMetrics, { time_window: timeWindow });

  if (metrics === undefined) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-3 pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">
            <Skeleton className="h-5 w-56" />
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2 text-left font-medium text-slate-600">Gate</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-600">Value</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {["coverage", "error", "incentive", "leaderboard", "smoke"].map((rowKey) => (
                  <tr
                    key={`p44-gate-skeleton-${rowKey}`}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-44" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  const rows: Array<{
    gate: string;
    value: string;
    status: GateState;
  }> = [
    {
      gate: "OPS Profile Coverage (>=95%)",
      value: `${metrics.profile_coverage.coverage_pct.toFixed(1)}%`,
      status: getGateState(metrics.profile_coverage.status === "pass"),
    },
    {
      gate: "Error Rate (<1%)",
      value:
        metrics.endpoint_error_rate.error_rate_pct === null
          ? "N/A"
          : `${metrics.endpoint_error_rate.error_rate_pct.toFixed(1)}%`,
      status: getGateState(metrics.endpoint_error_rate.status === "pass"),
    },
    {
      gate: "Incentive Sanity",
      value: `${metrics.incentive_sanity.mismatch_count} mismatches`,
      status: getGateState(metrics.incentive_sanity.status === "pass"),
    },
    {
      gate: "Backfill Completion (>=95%)",
      value: `${metrics.backfill_completion.completion_pct.toFixed(1)}%`,
      status: getGateState(metrics.backfill_completion.status === "pass"),
    },
  ];

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 pb-2">
        <CardTitle className="text-base font-semibold text-slate-900">
          P44 Release Gate Status
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">Rollout:</span>
          <RolloutStateBadge state={metrics.rollout_state} />
          <span className="ml-2 text-sm text-slate-600">Overall:</span>
          <GateBadge state={getGateState(metrics.gate_status.overall === "pass")} />
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-2 text-left font-medium text-slate-600">Gate</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Value</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.gate} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-700">{row.gate}</td>
                  <td className="px-4 py-3 text-slate-700">{row.value}</td>
                  <td className="px-4 py-3">
                    <GateBadge state={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
