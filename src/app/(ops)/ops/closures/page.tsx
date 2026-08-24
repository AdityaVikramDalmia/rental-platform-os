"use client";

import { usePaginatedQuery } from "convex/react";
import { FileCheck, Inbox } from "lucide-react";
import { useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { CLOSURE_STATUS, type ClosureStatus } from "../../../../../lib/constants";
import { formatINR } from "../../../../../lib/money";
import { ClosureStatusBadge } from "@/components/shared/closure-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const CLOSURE_FILTERS: Array<"ALL" | ClosureStatus> = [
  "ALL",
  CLOSURE_STATUS.PENDING,
  CLOSURE_STATUS.CONFIRMED,
  CLOSURE_STATUS.CANCELLED,
];

const SKELETON_CARD_KEYS = ["closure-skeleton-1", "closure-skeleton-2", "closure-skeleton-3"];

function getStatusLabel(value: "ALL" | ClosureStatus): string {
  if (value === "ALL") {
    return "All";
  }

  return value.replace(/_/g, " ");
}

function formatMoveInDate(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(ms));
}

export default function OpsClosuresPage() {
  const [statusFilter, setStatusFilter] = useState<ClosureStatus | undefined>(undefined);

  const { results, status, loadMore } = usePaginatedQuery(
    api.closures.list,
    { status: statusFilter },
    { initialNumItems: 15 },
  );

  const isLoading = status === "LoadingFirstPage";

  return (
    <div className="space-y-4 text-base">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-slate-900">Closures</h1>
        <p className="text-sm text-slate-500">Track confirmations and brokerage completion.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {CLOSURE_FILTERS.map((filterValue) => {
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
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>
            ))
          : results.map((closure) => {
              const brokerageTotal =
                (closure.brokerage_tenant_side ?? 0) + (closure.brokerage_owner_side ?? 0);
              const hasBrokerage =
                closure.brokerage_tenant_side !== undefined ||
                closure.brokerage_owner_side !== undefined;

              return (
                <Card
                  key={closure._id}
                  className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm"
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {closure.society?.name ?? "Unknown Society"} ·{" "}
                          {closure.building?.name ?? "Unknown Building"}
                        </p>
                        <p className="text-xs text-slate-500">
                          Flat {closure.lead?.flat_number ?? "\u2014"}
                        </p>
                      </div>
                      <ClosureStatusBadge status={closure.status} />
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>Move-in: {formatMoveInDate(closure.move_in_date)}</span>
                      <span className="font-semibold text-slate-700">
                        {hasBrokerage ? formatINR(brokerageTotal) : "\u2014"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {!isLoading && results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          <Inbox className="mx-auto mb-2 size-9 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No closures found</p>
          <p className="mt-1 text-xs text-slate-500">Recorded closures will appear here.</p>
        </div>
      ) : null}

      {status === "CanLoadMore" ? (
        <Button type="button" variant="outline" className="w-full" onClick={() => loadMore(15)}>
          Load More
        </Button>
      ) : null}

      {!isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <FileCheck className="size-3.5" />
          Showing {results.length} closure{results.length === 1 ? "" : "s"}
        </div>
      ) : null}
    </div>
  );
}
