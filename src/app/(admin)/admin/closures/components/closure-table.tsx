"use client";

import { usePaginatedQuery } from "convex/react";
import { FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import type { ClosureStatus } from "../../../../../../lib/constants";
import { formatINR } from "../../../../../../lib/money";
import { SortableHeader, type SortState } from "@/components/admin/SortableHeader";
import { ClosureStatusBadge } from "@/components/shared/closure-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const IST_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

type ClosureTableFilters = {
  status?: ClosureStatus;
  society_id?: Id<"societies">;
  date_from?: number;
  date_to?: number;
};

type ClosureTableProps = {
  filters: ClosureTableFilters;
  onVisibleClosuresChange?: (closures: ClosureTableItem[]) => void;
};

export type ClosureTableItem = {
  _id: Id<"closures">;
  move_in_date: number;
  confirmed_at?: number;
  brokerage_tenant_side?: number;
  brokerage_owner_side?: number;
  status: string;
  lead: {
    flat_number: string;
  } | null;
  building: {
    name: string;
  } | null;
  society: {
    _id: Id<"societies">;
    name: string;
  } | null;
  guard: {
    name: string;
  } | null;
  payout_status?: string | null;
  commission_amount?: number;
};

type ClosureSortColumn = "brokerage_total" | "move_in_date";

export function ClosureTable({ filters, onVisibleClosuresChange }: ClosureTableProps) {
  const router = useRouter();

  const queryArgs: Record<string, unknown> = {};
  if (filters.status) queryArgs.status = filters.status;
  if (filters.society_id) queryArgs.society_id = filters.society_id;
  if (filters.date_from) queryArgs.date_from = filters.date_from;
  if (filters.date_to) queryArgs.date_to = filters.date_to;

  const { results, status, loadMore } = usePaginatedQuery(api.closures.list, queryArgs, {
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
    const sorted = [...(results as ClosureTableItem[])];
    const sortColumn = currentSort.column as ClosureSortColumn | "";

    if (!sortColumn) {
      return sorted;
    }

    sorted.sort((a, b) => {
      switch (sortColumn) {
        case "brokerage_total": {
          const aTotal = (a.brokerage_tenant_side ?? 0) + (a.brokerage_owner_side ?? 0);
          const bTotal = (b.brokerage_tenant_side ?? 0) + (b.brokerage_owner_side ?? 0);
          return aTotal - bTotal;
        }
        case "move_in_date":
          return a.move_in_date - b.move_in_date;
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
    onVisibleClosuresChange?.(sortedResults);
  }, [onVisibleClosuresChange, sortedResults]);

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
          <table className="w-full min-w-[1060px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-2.5 font-medium">Lead (Building / Flat)</th>
                <th className="px-3 py-2.5 font-medium">Society</th>
                <SortableHeader
                  column="move_in_date"
                  label="Move-In Date"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                />
                <th className="px-3 py-2.5 font-medium">Commission</th>
                <SortableHeader
                  column="brokerage_total"
                  label="Brokerage T/O"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                />
                <th className="w-32 px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Guard</th>
                <th className="px-3 py-2.5 font-medium">Payout Status</th>
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr key={`closure-skeleton-${index}`} className="border-b border-slate-100">
                      {Array.from({ length: 8 }).map((_, colIdx) => (
                        <td key={`closure-skeleton-${index}-${colIdx}`} className="px-3 py-3">
                          <Skeleton className="h-4 w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                : sortedResults.map((closure) => {
                    const buildingName = closure.building?.name ?? "—";
                    const flatNumber = closure.lead?.flat_number ?? "—";
                    const societyName = closure.society?.name ?? "—";
                    const guardName = closure.guard?.name ?? "—";

                    const brokerageTenant = closure.brokerage_tenant_side;
                    const brokerageOwner = closure.brokerage_owner_side;
                    const brokerageDisplay =
                      brokerageTenant !== undefined || brokerageOwner !== undefined
                        ? `${brokerageTenant !== undefined ? formatINR(brokerageTenant) : "—"} / ${brokerageOwner !== undefined ? formatINR(brokerageOwner) : "—"}`
                        : "—";

                    return (
                      <tr
                        key={closure._id}
                        onClick={() => router.push(`/admin/closures/${closure._id}`)}
                        className={cn(
                          "cursor-pointer border-b border-slate-100 transition-colors",
                          "text-slate-800 hover:bg-slate-50",
                        )}
                      >
                        <td className="px-3 py-3">
                          <span className="text-slate-900">{buildingName}</span>
                          <span className="text-slate-400"> / </span>
                          <span className="font-medium text-slate-800">{flatNumber}</span>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{societyName}</td>
                        <td className="px-3 py-3 text-slate-700">
                          {IST_DATE_FORMATTER.format(closure.move_in_date)}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {closure.commission_amount !== undefined
                            ? formatINR(closure.commission_amount)
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-slate-700">{brokerageDisplay}</td>
                        <td className="px-3 py-3">
                          <ClosureStatusBadge status={closure.status as ClosureStatus} />
                        </td>
                        <td className="px-3 py-3 text-slate-700">{guardName}</td>
                        <td className="px-3 py-3 text-slate-600">
                          {closure.payout_status ?? "Not Created"}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!isLoading && results.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No closures found</p>
            <p className="mt-1 text-sm text-slate-500">
              Closures will appear here when deals are recorded.
            </p>
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
