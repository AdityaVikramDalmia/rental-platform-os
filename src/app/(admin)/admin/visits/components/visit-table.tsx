"use client";

import { usePaginatedQuery } from "convex/react";
import { AlertTriangle, Calendar, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import type { VisitStatus } from "../../../../../../lib/constants";
import { SortableHeader, type SortState } from "@/components/admin/SortableHeader";
import { VisitStatusBadge } from "@/components/shared/visit-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const IST_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const OUTCOME_LABELS: Record<string, string> = {
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not Interested",
  FOLLOWUP: "Follow-up",
};

type VisitTableFilters = {
  status?: VisitStatus;
  society_id?: Id<"societies">;
  assigned_guard_id?: Id<"users">;
  needs_reassignment?: boolean;
  date_from?: number;
  date_to?: number;
};

type VisitTableProps = {
  filters: VisitTableFilters;
  onVisibleVisitsChange?: (visits: VisitTableItem[]) => void;
};

export type VisitTableItem = {
  _id: Id<"visits">;
  status: string;
  scheduled_start: number;
  scheduled_end: number;
  needs_reassignment?: boolean;
  outcome?: string;
  outcome_notes?: string;
  lead: {
    flat_number: string;
    floor_number: string;
  } | null;
  building: {
    name: string;
  } | null;
  society: {
    name: string;
  } | null;
  guard: {
    name: string;
  } | null;
};

type VisitSortColumn = "scheduled_start" | "status";

export function VisitTable({ filters, onVisibleVisitsChange }: VisitTableProps) {
  const router = useRouter();

  const queryArgs: Record<string, unknown> = {};
  if (filters.status) queryArgs.status = filters.status;
  if (filters.society_id) queryArgs.society_id = filters.society_id;
  if (filters.assigned_guard_id) queryArgs.assigned_guard_id = filters.assigned_guard_id;
  if (filters.needs_reassignment !== undefined)
    queryArgs.needs_reassignment = filters.needs_reassignment;
  if (filters.date_from) queryArgs.date_from = filters.date_from;
  if (filters.date_to) queryArgs.date_to = filters.date_to;

  const { results, status, loadMore } = usePaginatedQuery(api.visits.list, queryArgs, {
    initialNumItems: 20,
  });

  const isLoading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const isLoadingMore = status === "LoadingMore";
  const hasMoreAvailable = status === "CanLoadMore";
  const [currentSort, setCurrentSort] = useState<SortState>({
    column: "",
    direction: "asc",
  });

  const sortedResults = useMemo(() => {
    const sorted = [...(results as VisitTableItem[])];
    const sortColumn = currentSort.column as VisitSortColumn | "";

    if (!sortColumn) {
      return sorted;
    }

    sorted.sort((a, b) => {
      switch (sortColumn) {
        case "scheduled_start":
          return a.scheduled_start - b.scheduled_start;
        case "status":
          return a.status.localeCompare(b.status, undefined, { sensitivity: "base" });
        default:
          return 0;
      }
    });

    if (currentSort.direction === "desc") {
      sorted.reverse();
    }

    return sorted;
  }, [currentSort.column, currentSort.direction, results]);

  useEffect(() => {
    onVisibleVisitsChange?.(sortedResults);
  }, [onVisibleVisitsChange, sortedResults]);

  const handleSort = (column: string) => {
    setCurrentSort((previous) => {
      if (previous.column === column) {
        return {
          column,
          direction: previous.direction === "asc" ? "desc" : "asc",
        };
      }

      return { column, direction: "asc" };
    });
  };

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="w-12 py-2.5 pr-2 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Lead (Building / Flat)</th>
                <th className="px-3 py-2.5 font-medium">Society</th>
                <SortableHeader
                  column="scheduled_start"
                  label="Date / Time"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                />
                <th className="px-3 py-2.5 font-medium">Guard</th>
                <SortableHeader
                  column="status"
                  label="Status"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                  className="w-32"
                />
                <th className="px-3 py-2.5 font-medium">Outcome</th>
                <th className="px-3 py-2.5 font-medium">Notes</th>
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr key={`visit-skeleton-${index}`} className="border-b border-slate-100">
                      <td className="py-3 pr-2">
                        <Skeleton className="h-4 w-6" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-36" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-28" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-16" />
                      </td>
                    </tr>
                  ))
                : sortedResults.map((visit, index) => {
                    const buildingName = visit.building?.name ?? "—";
                    const flatNumber = visit.lead?.flat_number ?? "—";
                    const floorNumber = visit.lead?.floor_number ?? "—";
                    const societyName = visit.society?.name ?? "—";
                    const guardName = visit.guard?.name ?? "—";

                    return (
                      <tr
                        key={visit._id}
                        onClick={() => router.push(`/admin/visits/${visit._id}`)}
                        className={cn(
                          "cursor-pointer border-b border-slate-100 transition-colors",
                          "text-slate-800 hover:bg-slate-50",
                        )}
                      >
                        <td className="py-3 pr-2 text-slate-400">{index + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-900">{buildingName}</span>
                            <span className="text-slate-400">/ Fl{floorNumber} /</span>
                            <span className="font-medium text-slate-800">{flatNumber}</span>
                            {visit.needs_reassignment && (
                              <span
                                className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700"
                                title="Needs reassignment"
                              >
                                <AlertTriangle className="size-3" />
                                Reassign
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{societyName}</td>
                        <td className="px-3 py-3 text-slate-700">
                          <div className="space-y-0.5">
                            <div>{IST_FORMATTER.format(visit.scheduled_start)}</div>
                            <div className="text-xs text-slate-400">
                              to{" "}
                              {new Intl.DateTimeFormat("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                                timeZone: "Asia/Kolkata",
                              }).format(visit.scheduled_end)}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{guardName}</td>
                        <td className="px-3 py-3">
                          <VisitStatusBadge status={visit.status as VisitStatus} />
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {visit.outcome ? (OUTCOME_LABELS[visit.outcome] ?? visit.outcome) : "—"}
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-3 text-slate-500">
                          {visit.outcome_notes ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!isLoading && results.length === 0 && (
          <div className="py-12 text-center">
            <Calendar className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No visits found</p>
            <p className="mt-1 text-sm text-slate-500">Visits will appear here when scheduled.</p>
          </div>
        )}

        {!isLoading && (
          <p className="pt-4 text-sm text-muted-foreground">
            Showing {results.length} results{hasMoreAvailable ? " (more available)" : ""}
          </p>
        )}

        {(canLoadMore || isLoadingMore) && (
          <div className="flex justify-center pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => loadMore(20)}
              disabled={isLoadingMore}
              className="border-slate-300 text-slate-700"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
