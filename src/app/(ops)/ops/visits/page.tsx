"use client";

import { usePaginatedQuery } from "convex/react";
import { Calendar, Inbox } from "lucide-react";
import { useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { VISIT_STATUS, type VisitStatus } from "../../../../../lib/constants";
import { VisitStatusBadge } from "@/components/shared/visit-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const VISIT_FILTERS: Array<"ALL" | VisitStatus> = [
  "ALL",
  VISIT_STATUS.ASSIGNED,
  VISIT_STATUS.CONFIRMED,
  VISIT_STATUS.IN_PROGRESS,
  VISIT_STATUS.COMPLETED,
  VISIT_STATUS.CANCELLED,
  VISIT_STATUS.NO_SHOW,
];

const SKELETON_CARD_KEYS = ["visit-skeleton-1", "visit-skeleton-2", "visit-skeleton-3"];

function getStatusLabel(value: "ALL" | VisitStatus): string {
  if (value === "ALL") {
    return "All";
  }

  return value.replace(/_/g, " ");
}

function formatVisitDate(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(ms));
}

export default function OpsVisitsPage() {
  const [statusFilter, setStatusFilter] = useState<VisitStatus | undefined>(undefined);

  const { results, status, loadMore } = usePaginatedQuery(
    api.visits.list,
    { status: statusFilter },
    { initialNumItems: 15 },
  );

  const isLoading = status === "LoadingFirstPage";

  return (
    <div className="space-y-4 text-base">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-slate-900">Visit Board</h1>
        <p className="text-sm text-slate-500">Monitor field movement and visit outcomes.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {VISIT_FILTERS.map((filterValue) => {
          const activeValue = filterValue === "ALL" ? undefined : filterValue;
          const isActive = statusFilter === activeValue;

          return (
            <button
              key={filterValue}
              type="button"
              onClick={() => setStatusFilter(activeValue)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {getStatusLabel(filterValue)}
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5">
        {isLoading
          ? SKELETON_CARD_KEYS.map((key) => (
              <Card key={key} className="overflow-hidden rounded-xl border-slate-200">
                <CardContent className="space-y-3 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-44" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>
            ))
          : results.map((visit) => (
              <Card
                key={visit._id}
                className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm"
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {formatVisitDate(visit.scheduled_start)}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {visit.society?.name ?? "Unknown Society"} ·{" "}
                        {visit.building?.name ?? "Unknown Building"}
                      </p>
                    </div>
                    <VisitStatusBadge status={visit.status} />
                  </div>

                  <p className="mt-1.5 text-xs text-slate-400">
                    Guard: {visit.guard?.name ?? "Unassigned"}
                  </p>
                </CardContent>
              </Card>
            ))}
      </div>

      {!isLoading && results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          <Inbox className="mx-auto mb-2 size-9 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No visits found</p>
          <p className="mt-1 text-xs text-slate-500">Scheduled visits will appear here.</p>
        </div>
      ) : null}

      {status === "CanLoadMore" ? (
        <Button type="button" variant="outline" className="w-full" onClick={() => loadMore(15)}>
          Load More
        </Button>
      ) : null}

      {!isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Calendar className="size-3.5" />
          Showing {results.length} visit{results.length === 1 ? "" : "s"}
        </div>
      ) : null}
    </div>
  );
}
