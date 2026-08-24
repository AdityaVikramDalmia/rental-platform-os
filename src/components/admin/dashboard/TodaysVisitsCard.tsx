"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";
import { VISIT_STATUS, type VisitStatus } from "../../../../lib/constants";
import { VisitStatusBadge } from "@/components/shared/visit-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TIMELINE_DOT_COLORS: Record<VisitStatus, string> = {
  [VISIT_STATUS.ASSIGNED]: "bg-blue-500",
  [VISIT_STATUS.CONFIRMED]: "bg-green-500",
  [VISIT_STATUS.IN_PROGRESS]: "bg-amber-500",
  [VISIT_STATUS.COMPLETED]: "bg-gray-400",
  [VISIT_STATUS.NO_SHOW]: "bg-red-500",
  [VISIT_STATUS.CANCELLED]: "bg-gray-300",
};

function formatVisitTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatTodayLabel(startOfTodayMs: number): string {
  return new Date(startOfTodayMs).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function TimelineSkeletonRows() {
  return Array.from({ length: 3 }).map((_, index) => (
    <div key={`today-visit-skeleton-${index}`} className="flex items-start gap-3">
      <Skeleton className="mt-1 h-4 w-12 shrink-0" />
      <div className="relative flex-1 border-l-2 border-gray-200 pl-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="mt-2 h-4 w-1/2" />
      </div>
    </div>
  ));
}

export function TodaysVisitsCard() {
  const startOfTodayMs = useMemo(() => new Date().setHours(0, 0, 0, 0), []);
  const todaysVisits = useQuery(api.visits.getVisitsByDate, { date_ms: startOfTodayMs });

  const sortedVisits = useMemo(
    () => [...(todaysVisits ?? [])].sort((a, b) => a.scheduled_start_ms - b.scheduled_start_ms),
    [todaysVisits],
  );

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base text-slate-900">
          Today&apos;s Visits ({todaysVisits?.length ?? 0})
        </CardTitle>
        <span className="text-sm text-slate-500">{formatTodayLabel(startOfTodayMs)}</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {todaysVisits === undefined ? (
          <TimelineSkeletonRows />
        ) : sortedVisits.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
            <CalendarDays className="size-4 text-slate-400" />
            <span>No visits scheduled for today</span>
          </div>
        ) : (
          <div className="space-y-1">
            {sortedVisits.map((visit) => {
              const status = visit.status as VisitStatus;
              return (
                <Link
                  key={visit.visit_id}
                  href="/admin/visits"
                  className="block rounded-md px-1 py-1 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 shrink-0 pt-1 text-sm text-gray-500">
                      {formatVisitTime(visit.scheduled_start_ms)}
                    </div>
                    <div className="relative flex-1 border-l-2 border-gray-200 pl-3">
                      <span
                        className={cn(
                          "absolute -left-[7px] top-2 block size-3 rounded-full ring-2 ring-white",
                          TIMELINE_DOT_COLORS[status] ?? "bg-gray-300",
                        )}
                      />
                      <div className="flex flex-col gap-2 pb-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-medium text-slate-900">
                          {visit.guard_name} · {visit.society_name} · {visit.flat_number}
                        </p>
                        <VisitStatusBadge status={status} />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
