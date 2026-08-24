"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { api } from "../../../../../../convex/_generated/api";
import type { PersonaFilter, TimeWindow } from "../page";
import { TrendLineChart } from "./trend-line-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SocietyTabProps = {
  timeWindow: TimeWindow;
  personaFilter: PersonaFilter;
};

type SortKey =
  | "society_name"
  | "city"
  | "field_worker_count"
  | "leads_count"
  | "verified_rate"
  | "closures_count"
  | "avg_days_to_closure";

type SortDirection = "asc" | "desc";

function formatPercent(value: number | null): string {
  if (value === null) {
    return "No data yet";
  }

  return `${value.toFixed(1)}%`;
}

function formatDays(value: number | null): string {
  if (value === null) {
    return "No data yet";
  }

  return `${value.toFixed(1)} days`;
}

function getSortValue(
  row: {
    society_name: string;
    city: string;
    guard_count: number;
    ops_count: number;
    field_worker_count: number;
    leads_count: number;
    verified_rate: number | null;
    closures_count: number;
    avg_days_to_closure: number | null;
  },
  key: SortKey,
): number | string {
  if (key === "society_name") return row.society_name;
  if (key === "city") return row.city;
  if (key === "field_worker_count") return row.field_worker_count;
  if (key === "leads_count") return row.leads_count;
  if (key === "verified_rate") return row.verified_rate ?? -1;
  if (key === "closures_count") return row.closures_count;
  return row.avg_days_to_closure ?? -1;
}

export function SocietyTab({ timeWindow, personaFilter }: SocietyTabProps) {
  const societies = useQuery(api.analytics.getSocietyComparison, {
    time_window: timeWindow,
    persona_filter: personaFilter,
  });
  const [sortKey, setSortKey] = useState<SortKey>("leads_count");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [expandedSocietyId, setExpandedSocietyId] = useState<Id<"societies"> | null>(null);

  const topGuards = useQuery(
    api.analytics.getGuardLeaderboard,
    expandedSocietyId
      ? {
          society_id: expandedSocietyId,
          metric: "verified",
          time_window: timeWindow,
          persona_filter: personaFilter,
          limit: 5,
        }
      : "skip",
  );

  const sortedSocieties = useMemo(() => {
    if (!societies) {
      return [];
    }

    return [...societies].sort((a, b) => {
      const left = getSortValue(a, sortKey);
      const right = getSortValue(b, sortKey);

      if (typeof left === "string" && typeof right === "string") {
        const result = left.localeCompare(right);
        return sortDirection === "asc" ? result : -result;
      }

      const numericResult = Number(left) - Number(right);
      return sortDirection === "asc" ? numericResult : -numericResult;
    });
  }, [societies, sortDirection, sortKey]);

  function onSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("asc");
  }

  if (societies === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-7 animate-spin text-slate-500" />
      </div>
    );
  }

  if (societies.length === 0) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="py-16 text-center text-sm text-slate-500">
          No society data available for this period.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900">Society Comparison</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-2.5 font-medium">Society</th>
                <th className="px-3 py-2.5 font-medium">City</th>
                <th className="px-3 py-2.5 font-medium">
                  <button type="button" onClick={() => onSort("field_worker_count")}>
                    Field Workers
                  </button>
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <button type="button" onClick={() => onSort("leads_count")}>
                    Leads
                  </button>
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <button type="button" onClick={() => onSort("verified_rate")}>
                    Verified Rate
                  </button>
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <button type="button" onClick={() => onSort("closures_count")}>
                    Closures
                  </button>
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <button type="button" onClick={() => onSort("avg_days_to_closure")}>
                    Avg Days to Closure
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedSocieties.map((society) => {
                const isExpanded = expandedSocietyId === society.society_id;
                const hasLeads = society.leads_count > 0;

                return (
                  <Fragment key={society.society_id}>
                    <tr
                      className={cn(
                        "cursor-pointer border-b border-slate-100 text-slate-800 transition-colors hover:bg-slate-50",
                        isExpanded && "bg-slate-50",
                      )}
                      onClick={() =>
                        setExpandedSocietyId((prev) =>
                          prev === society.society_id ? null : society.society_id,
                        )
                      }
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronUp className="size-4 text-slate-500" />
                          ) : (
                            <ChevronDown className="size-4 text-slate-500" />
                          )}
                          <span className="font-medium text-slate-900">{society.society_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{society.city}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {society.field_worker_count}
                        <span className="ml-1 text-xs text-slate-500">
                          ({society.guard_count}G / {society.ops_count}O)
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {hasLeads ? society.leads_count.toLocaleString("en-IN") : "No data yet"}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {hasLeads ? formatPercent(society.verified_rate) : "No data yet"}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {hasLeads ? society.closures_count.toLocaleString("en-IN") : "No data yet"}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {hasLeads ? formatDays(society.avg_days_to_closure) : "No data yet"}
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <td colSpan={7} className="p-4">
                          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            <TrendLineChart
                              timeWindow={timeWindow}
                              societyId={society.society_id}
                              title={`${society.society_name} Lead Trend`}
                            />

                            <Card className="border-slate-200 bg-white shadow-sm">
                              <CardHeader>
                                <CardTitle className="text-base text-slate-900">
                                  Top Guards
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                {topGuards === undefined ? (
                                  <div className="flex h-[220px] items-center justify-center">
                                    <Loader2 className="size-5 animate-spin text-slate-500" />
                                  </div>
                                ) : topGuards.length === 0 ? (
                                  <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">
                                    No guard data available for this society.
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full border-collapse text-left text-sm">
                                      <thead>
                                        <tr className="border-b border-slate-200 text-slate-500">
                                          <th className="px-2 py-2 font-medium">#</th>
                                          <th className="px-2 py-2 font-medium">Guard</th>
                                          <th className="px-2 py-2 font-medium">Leads</th>
                                          <th className="px-2 py-2 font-medium">Verified Rate</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {topGuards.map((guard) => (
                                          <tr
                                            key={guard.guard_user_id}
                                            className="border-b border-slate-100"
                                          >
                                            <td className="px-2 py-2 text-slate-600">
                                              {guard.rank}
                                            </td>
                                            <td className="px-2 py-2 font-medium text-slate-800">
                                              {guard.guard_name}
                                            </td>
                                            <td className="px-2 py-2 text-slate-700">
                                              {guard.leads}
                                            </td>
                                            <td className="px-2 py-2 text-slate-700">
                                              {guard.verified_rate === null
                                                ? "—"
                                                : `${guard.verified_rate.toFixed(1)}%`}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          </div>

                          <Card className="mt-4 border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                              <CardTitle className="text-base text-slate-900">
                                Building Breakdown
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm text-slate-500">
                              {/* TODO: Add building-level breakdown when a dedicated backend endpoint is available. */}
                              Building breakdown coming soon.
                            </CardContent>
                          </Card>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
