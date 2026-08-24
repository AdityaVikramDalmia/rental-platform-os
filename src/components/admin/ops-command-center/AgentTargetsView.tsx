"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { SortableHeader, type SortState } from "@/components/admin/SortableHeader";
import { KPI_METRICS, getMetricLabel } from "@/components/admin/ops-command-center/metric-options";
import { TargetProgressBar } from "@/components/admin/ops-command-center/TargetProgressBar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_OPTIONS = ["ACTIVE", "COMPLETED", "MISSED", "EXCEEDED", "CANCELLED"] as const;
const PERIOD_OPTIONS = ["WEEKLY", "MONTHLY", "QUARTERLY"] as const;

type TargetsSortColumn =
  | "agent"
  | "metric"
  | "target"
  | "actual"
  | "progress"
  | "status"
  | "period";

function formatMetricValue(metric: string, value: number): string {
  const metricMeta = KPI_METRICS.find((item) => item.value === metric);
  if (metricMeta?.unit === "percent") {
    return `${value.toFixed(1)}%`;
  }

  if (metricMeta?.unit === "score") {
    return value.toFixed(1);
  }

  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatPeriod(start: number, end: number): string {
  const startText = new Date(start).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
  const endText = new Date(end).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
  return `${startText} - ${endText}`;
}

function getStatusClassName(status: string): string {
  if (status === "EXCEEDED" || status === "COMPLETED") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "MISSED") {
    return "bg-red-100 text-red-700";
  }
  if (status === "CANCELLED") {
    return "bg-slate-100 text-slate-700";
  }
  return "bg-blue-100 text-blue-700";
}

export function AgentTargetsView() {
  const targetRows = useQuery(api.opsManagement.listAllTargets, { limit: 100 });

  const [agentFilter, setAgentFilter] = useState<string>("ALL");
  const [metricFilter, setMetricFilter] = useState<string>("ALL");
  const [periodFilter, setPeriodFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortState, setSortState] = useState<SortState>({
    column: "period",
    direction: "desc",
  });

  const agentOptions = useMemo(() => {
    if (!targetRows) {
      return [];
    }

    const uniqueAgents = new Map<string, string>();
    for (const row of targetRows) {
      const userId = row.agent?.user_id ?? row.agent_user_id;
      const name = row.agent?.name ?? "Unknown Agent";
      uniqueAgents.set(userId, name);
    }

    return Array.from(uniqueAgents.entries())
      .map(([userId, name]) => ({ userId, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [targetRows]);

  const visibleRows = useMemo(() => {
    if (!targetRows) {
      return [];
    }

    const filtered = targetRows.filter((row) => {
      const matchesAgent = agentFilter === "ALL" || row.agent_user_id === agentFilter;
      const matchesMetric = metricFilter === "ALL" || row.metric === metricFilter;
      const matchesPeriod = periodFilter === "ALL" || row.period_type === periodFilter;
      const matchesStatus = statusFilter === "ALL" || row.status === statusFilter;

      return matchesAgent && matchesMetric && matchesPeriod && matchesStatus;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const directionFactor = sortState.direction === "asc" ? 1 : -1;
      const column = sortState.column as TargetsSortColumn;

      if (column === "agent") {
        const aName = a.agent?.name ?? "Unknown Agent";
        const bName = b.agent?.name ?? "Unknown Agent";
        return aName.localeCompare(bName) * directionFactor;
      }

      if (column === "metric") {
        const aMetric = getMetricLabel(a.metric);
        const bMetric = getMetricLabel(b.metric);
        return aMetric.localeCompare(bMetric) * directionFactor;
      }

      if (column === "target") {
        return (a.target_value - b.target_value) * directionFactor;
      }

      if (column === "actual") {
        const aActual = a.actual_value ?? Number.NEGATIVE_INFINITY;
        const bActual = b.actual_value ?? Number.NEGATIVE_INFINITY;
        return (aActual - bActual) * directionFactor;
      }

      if (column === "progress") {
        const aProgress = a.progress_pct ?? Number.NEGATIVE_INFINITY;
        const bProgress = b.progress_pct ?? Number.NEGATIVE_INFINITY;
        return (aProgress - bProgress) * directionFactor;
      }

      if (column === "status") {
        return a.status.localeCompare(b.status) * directionFactor;
      }

      return (a.period_start - b.period_start) * directionFactor;
    });

    return sorted;
  }, [agentFilter, metricFilter, periodFilter, sortState, statusFilter, targetRows]);

  const teamSummary = useMemo(() => {
    const totalTargets = visibleRows.length;
    const resolved = visibleRows.filter((row) => row.status !== "ACTIVE");
    const hitCount = resolved.filter(
      (row) => row.status === "EXCEEDED" || row.status === "COMPLETED",
    ).length;

    const hitRate = resolved.length === 0 ? null : (hitCount / resolved.length) * 100;

    return {
      totalTargets,
      hitRate,
      hitCount,
      resolvedCount: resolved.length,
    };
  }, [visibleRows]);

  const handleSortAction = (column: string) => {
    setSortState((current) => {
      if (current.column !== column) {
        return {
          column,
          direction: "asc",
        };
      }

      return {
        column,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
  };

  if (targetRows === undefined) {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardHeader className="space-y-1">
          <CardTitle className="text-base text-slate-900">Agent Targets</CardTitle>
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_value, index) => (
              <Skeleton key={`target-filter-skeleton-${index + 1}`} className="h-9 w-full" />
            ))}
          </div>
          {Array.from({ length: 4 }, (_value, index) => (
            <Skeleton key={`target-row-skeleton-${index + 1}`} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border border-slate-200 bg-white">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base text-slate-900">Agent Targets</CardTitle>
        <p className="text-xs text-slate-500">
          Track KPI goals by agent with filters for period, status, and metric.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-full bg-white">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All agents</SelectItem>
              {agentOptions.map((agent) => (
                <SelectItem key={agent.userId} value={agent.userId}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={metricFilter} onValueChange={setMetricFilter}>
            <SelectTrigger className="w-full bg-white">
              <SelectValue placeholder="All metrics" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All metrics</SelectItem>
              {KPI_METRICS.map((metric) => (
                <SelectItem key={metric.value} value={metric.value}>
                  {metric.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-full bg-white">
              <SelectValue placeholder="All periods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All periods</SelectItem>
              {PERIOD_OPTIONS.map((period) => (
                <SelectItem key={period} value={period}>
                  {period}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full bg-white">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
              <tr>
                <SortableHeader
                  column="agent"
                  label="Agent"
                  currentSort={sortState}
                  onSortAction={handleSortAction}
                />
                <SortableHeader
                  column="metric"
                  label="Metric"
                  currentSort={sortState}
                  onSortAction={handleSortAction}
                />
                <SortableHeader
                  column="target"
                  label="Target"
                  currentSort={sortState}
                  onSortAction={handleSortAction}
                />
                <SortableHeader
                  column="actual"
                  label="Actual"
                  currentSort={sortState}
                  onSortAction={handleSortAction}
                />
                <SortableHeader
                  column="progress"
                  label="Progress"
                  currentSort={sortState}
                  onSortAction={handleSortAction}
                />
                <SortableHeader
                  column="status"
                  label="Status"
                  currentSort={sortState}
                  onSortAction={handleSortAction}
                />
                <SortableHeader
                  column="period"
                  label="Period"
                  currentSort={sortState}
                  onSortAction={handleSortAction}
                />
              </tr>
            </thead>

            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-600">
                    No targets match the current filters.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row._id} className="border-b border-slate-100 align-top last:border-b-0">
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      {row.agent?.name ?? "Unknown Agent"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="space-y-0.5">
                        <p className="font-medium text-slate-900">{getMetricLabel(row.metric)}</p>
                        <p className="text-xs text-slate-500">
                          {KPI_METRICS.find((item) => item.value === row.metric)?.description ??
                            row.metric}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-800">
                      {formatMetricValue(row.metric, row.target_value)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-800">
                      {row.actual_value === null || row.actual_value === undefined
                        ? "—"
                        : formatMetricValue(row.metric, row.actual_value)}
                    </td>
                    <td className="px-3 py-2.5">
                      <TargetProgressBar progress={row.progress_pct ?? null} status={row.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge className={getStatusClassName(row.status)}>{row.status}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {formatPeriod(row.period_start, row.period_end)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            <tfoot className="border-t border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={4} className="px-3 py-2.5 text-sm font-semibold text-slate-900">
                  Team Summary
                </td>
                <td colSpan={3} className="px-3 py-2.5 text-sm text-slate-700">
                  Total:{" "}
                  <span className="font-semibold text-slate-900">{teamSummary.totalTargets}</span>
                  {" • "}
                  Hit Rate:{" "}
                  <span className="font-semibold text-slate-900">
                    {teamSummary.hitRate === null ? "—" : `${teamSummary.hitRate.toFixed(1)}%`}
                  </span>
                  {" ("}
                  {teamSummary.hitCount}/{teamSummary.resolvedCount}
                  {" resolved)"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
