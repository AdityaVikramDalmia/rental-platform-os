"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { FileText, Inbox } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { LEAD_STATUS, type LeadStatus } from "../../../../../lib/constants";
import { formatRelativeTime } from "../../../../../lib/dates";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const LEAD_FILTERS: Array<"ALL" | LeadStatus> = [
  "ALL",
  LEAD_STATUS.SUBMITTED,
  LEAD_STATUS.NEED_INFO,
  LEAD_STATUS.POTENTIAL_DUPLICATE,
  LEAD_STATUS.VERIFIED,
  LEAD_STATUS.REJECTED,
];

const SKELETON_CARD_KEYS = ["lead-skeleton-1", "lead-skeleton-2", "lead-skeleton-3"];

function getStatusLabel(value: "ALL" | LeadStatus): string {
  if (value === "ALL") {
    return "All";
  }

  return value.replace(/_/g, " ");
}

export default function OpsLeadsPage() {
  const [statusFilter, setStatusFilter] = useState<LeadStatus | undefined>(undefined);

  const counts = useQuery(api.leads.getStatusCounts, {});
  const { results, status, loadMore } = usePaginatedQuery(
    api.leads.list,
    { status: statusFilter },
    { initialNumItems: 15 },
  );

  const totalCount = useMemo(() => {
    if (!counts) {
      return undefined;
    }

    return Object.values(counts).reduce((sum, value) => sum + value, 0);
  }, [counts]);

  const isLoading = status === "LoadingFirstPage";

  return (
    <div className="space-y-4 text-base">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-slate-900">Lead Queue</h1>
        <p className="text-sm text-slate-500">Review submissions and keep the pipeline moving.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {LEAD_FILTERS.map((filterValue) => {
          const activeValue = filterValue === "ALL" ? undefined : filterValue;
          const isActive = statusFilter === activeValue;
          const count =
            filterValue === "ALL"
              ? totalCount
              : counts?.[filterValue as Exclude<typeof filterValue, "ALL">];

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
              {getStatusLabel(filterValue)} {count ? `(${count})` : ""}
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
                      <Skeleton className="h-3 w-36" />
                    </div>
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            ))
          : results.map((lead) => (
              <Card
                key={lead._id}
                className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm"
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {lead.society_name ?? "Unknown Society"} ·{" "}
                        {lead.building_name ?? "Unknown Building"}
                      </p>
                      <p className="text-xs text-slate-500">
                        Flat {lead.flat_number} · {lead.guard_name ?? "Unknown Guard"}
                      </p>
                    </div>
                    <LeadStatusBadge status={lead.status} />
                  </div>

                  <p className="mt-1.5 text-xs text-slate-400">
                    {formatRelativeTime(lead._creationTime)}
                  </p>
                </CardContent>
              </Card>
            ))}
      </div>

      {!isLoading && results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          <Inbox className="mx-auto mb-2 size-9 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No leads found</p>
          <p className="mt-1 text-xs text-slate-500">
            Try switching filters or check again shortly.
          </p>
        </div>
      ) : null}

      {status === "CanLoadMore" ? (
        <Button type="button" variant="outline" className="w-full" onClick={() => loadMore(15)}>
          Load More
        </Button>
      ) : null}

      {!isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <FileText className="size-3.5" />
          Showing {results.length} lead{results.length === 1 ? "" : "s"}
        </div>
      ) : null}
    </div>
  );
}
