"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Calendar } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { VISIT_STATUS } from "../../../../lib/constants";
import { VisitStatusBadge } from "@/components/shared/visit-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const OUTCOME_LABELS: Record<string, string> = {
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not Interested",
  FOLLOWUP: "Follow-up",
};

const UPCOMING_SKELETON_ROW_KEYS = ["one", "two", "three", "four", "five"] as const;
const UPCOMING_SKELETON_COL_KEYS = ["property", "window", "status", "tenant"] as const;
const PAST_SKELETON_ROW_KEYS = ["one", "two", "three", "four", "five"] as const;
const PAST_SKELETON_COL_KEYS = ["property", "window", "status", "outcome", "tenant"] as const;

type GuardVisitsTabProps = {
  guardId: Id<"guard_profiles">;
  guardUserId?: Id<"users">;
  workerLabel: string;
};

function formatVisitWindow(start: number, end: number): string {
  const datePart = DATE_TIME_FORMATTER.format(start);
  const endTimePart = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(end);

  return `${datePart} - ${endTimePart}`;
}

function readTenantName(visit: unknown): string {
  if (!visit || typeof visit !== "object") {
    return "\u2014";
  }

  const value = (visit as { tenant_name?: unknown }).tenant_name;
  return typeof value === "string" && value.length > 0 ? value : "\u2014";
}

export function GuardVisitsTab({ guardId, guardUserId, workerLabel }: GuardVisitsTabProps) {
  const guardList = useQuery(api.guards.list, guardUserId ? "skip" : {});

  const resolvedGuardUserId = useMemo(() => {
    if (guardUserId) {
      return guardUserId;
    }

    return guardList?.find((guard) => guard.guard_profile_id === guardId)?.user_id;
  }, [guardId, guardList, guardUserId]);

  const visitResponse = useQuery(
    api.visits.list,
    resolvedGuardUserId
      ? {
          paginationOpts: { numItems: 500, cursor: null },
          assigned_guard_id: resolvedGuardUserId,
        }
      : "skip",
  );

  const visitRows = visitResponse?.page ?? [];
  const isLoading = resolvedGuardUserId === undefined || visitResponse === undefined;

  const upcomingVisits = useMemo(() => {
    return visitRows
      .filter(
        (visit) =>
          visit.status === VISIT_STATUS.ASSIGNED ||
          visit.status === VISIT_STATUS.CONFIRMED ||
          visit.status === VISIT_STATUS.IN_PROGRESS,
      )
      .sort((a, b) => a.scheduled_start - b.scheduled_start);
  }, [visitRows]);

  const pastVisits = useMemo(() => {
    return visitRows
      .filter(
        (visit) =>
          visit.status === VISIT_STATUS.COMPLETED ||
          visit.status === VISIT_STATUS.CANCELLED ||
          visit.status === VISIT_STATUS.NO_SHOW,
      )
      .sort((a, b) => b.scheduled_start - a.scheduled_start);
  }, [visitRows]);

  const totalVisits = visitRows.length;
  const completedCount = visitRows.filter(
    (visit) => visit.status === VISIT_STATUS.COMPLETED,
  ).length;
  const noShowCount = visitRows.filter((visit) => visit.status === VISIT_STATUS.NO_SHOW).length;
  const completionRate = totalVisits > 0 ? (completedCount / totalVisits) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Visits</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{totalVisits}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Completion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{completionRate.toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">No-Show Count</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{noShowCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Upcoming Visits</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Property / Flat</th>
                  <th className="px-3 py-2.5 font-medium">Date / Time</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Tenant</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? UPCOMING_SKELETON_ROW_KEYS.map((rowKey) => (
                      <tr
                        key={`upcoming-visit-skeleton-${rowKey}`}
                        className="border-b border-slate-100"
                      >
                        {UPCOMING_SKELETON_COL_KEYS.map((colKey) => (
                          <td
                            key={`upcoming-visit-skeleton-${rowKey}-${colKey}`}
                            className="px-3 py-3"
                          >
                            <Skeleton className="h-4 w-28" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : upcomingVisits.map((visit) => (
                      <tr
                        key={visit._id}
                        className="border-b border-slate-100 text-slate-800 transition-colors hover:bg-slate-50"
                      >
                        <td className="px-3 py-3">
                          <Link
                            href={`/admin/visits/${visit._id}`}
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            <span className="text-slate-900">
                              {visit.building?.name ?? "\u2014"}
                            </span>
                            <span className="text-slate-400">
                              / Fl{visit.lead?.floor_number ?? "\u2014"} /
                            </span>
                            <span className="font-medium text-slate-800">
                              {visit.lead?.flat_number ?? "\u2014"}
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatVisitWindow(visit.scheduled_start, visit.scheduled_end)}
                        </td>
                        <td className="px-3 py-3">
                          <VisitStatusBadge status={visit.status} />
                        </td>
                        <td className="px-3 py-3 text-slate-700">{readTenantName(visit)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {!isLoading && upcomingVisits.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-600">No upcoming visits.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Past Visits</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Property / Flat</th>
                  <th className="px-3 py-2.5 font-medium">Date / Time</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Outcome</th>
                  <th className="px-3 py-2.5 font-medium">Tenant</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? PAST_SKELETON_ROW_KEYS.map((rowKey) => (
                      <tr
                        key={`past-visit-skeleton-${rowKey}`}
                        className="border-b border-slate-100"
                      >
                        {PAST_SKELETON_COL_KEYS.map((colKey) => (
                          <td key={`past-visit-skeleton-${rowKey}-${colKey}`} className="px-3 py-3">
                            <Skeleton className="h-4 w-28" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : pastVisits.map((visit) => (
                      <tr
                        key={visit._id}
                        className="border-b border-slate-100 text-slate-800 transition-colors hover:bg-slate-50"
                      >
                        <td className="px-3 py-3">
                          <Link
                            href={`/admin/visits/${visit._id}`}
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            <span className="text-slate-900">
                              {visit.building?.name ?? "\u2014"}
                            </span>
                            <span className="text-slate-400">
                              / Fl{visit.lead?.floor_number ?? "\u2014"} /
                            </span>
                            <span className="font-medium text-slate-800">
                              {visit.lead?.flat_number ?? "\u2014"}
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatVisitWindow(visit.scheduled_start, visit.scheduled_end)}
                        </td>
                        <td className="px-3 py-3">
                          <VisitStatusBadge status={visit.status} />
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {visit.outcome
                            ? (OUTCOME_LABELS[visit.outcome] ?? visit.outcome)
                            : "\u2014"}
                        </td>
                        <td className="px-3 py-3 text-slate-700">{readTenantName(visit)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {!isLoading && pastVisits.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-600">No past visits.</p>
          )}
        </CardContent>
      </Card>

      {!isLoading && upcomingVisits.length === 0 && pastVisits.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 py-12 text-center">
          <Calendar className="mx-auto mb-3 size-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            No visits assigned to this {workerLabel} yet.
          </p>
        </div>
      )}
    </div>
  );
}
