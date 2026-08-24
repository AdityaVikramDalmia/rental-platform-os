"use client";

import { usePaginatedQuery } from "convex/react";
import { FileSearch, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { api } from "../../../../../../convex/_generated/api";
import type { ListingStatus } from "../../../../../../lib/constants";
import { formatRelativeTime } from "../../../../../../lib/dates";
import { formatINR } from "../../../../../../lib/money";
import { SortableHeader, type SortState } from "@/components/admin/SortableHeader";
import { ListingStatusBadge } from "@/components/shared/listing-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ListingTableProps = {
  statusFilter: ListingStatus | undefined;
  onVisibleListingsChange?: (listings: ListingTableItem[]) => void;
};

export type ListingTableItem = {
  _id: Id<"listings">;
  _creationTime: number;
  bhk_config: string;
  building_name?: string;
  society_name?: string;
  floor_number: string;
  rent_monthly: number;
  status: ListingStatus;
};

type ListingSortColumn = "rent" | "status" | "created";

export function ListingTable({ statusFilter, onVisibleListingsChange }: ListingTableProps) {
  const router = useRouter();

  const { results, status, loadMore } = usePaginatedQuery(
    api.listings.list,
    {
      status: statusFilter,
    },
    { initialNumItems: 20 },
  );

  const isLoading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const isLoadingMore = status === "LoadingMore";
  const hasMoreAvailable = status === "CanLoadMore";
  const [currentSort, setCurrentSort] = useState<SortState>({
    column: "",
    direction: "asc",
  });

  const sortedResults = useMemo(() => {
    const sorted = [...(results as ListingTableItem[])];
    const sortColumn = currentSort.column as ListingSortColumn | "";

    if (!sortColumn) {
      return sorted;
    }

    sorted.sort((a, b) => {
      switch (sortColumn) {
        case "rent":
          return a.rent_monthly - b.rent_monthly;
        case "status":
          return a.status.localeCompare(b.status, undefined, { sensitivity: "base" });
        case "created":
          return a._creationTime - b._creationTime;
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
    onVisibleListingsChange?.(sortedResults);
  }, [onVisibleListingsChange, sortedResults]);

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
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-2.5 font-medium">Listing</th>
                <th className="px-3 py-2.5 font-medium">Society</th>
                {/* Inquiries column removed — count not available in existing query */}
                <SortableHeader
                  column="rent"
                  label="Rent"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                />
                <SortableHeader
                  column="status"
                  label="Status"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                  className="w-28"
                />
                <SortableHeader
                  column="created"
                  label="Created"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                  className="w-24"
                />
                <th className="w-16 px-3 py-2.5 font-medium">Lead</th>
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr key={`listing-skeleton-${index}`} className="border-b border-slate-100">
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-40" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-28" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-16" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-10" />
                      </td>
                    </tr>
                  ))
                : sortedResults.map((listing) => {
                    const listingLabel = `${listing.bhk_config} ${listing.building_name ?? "—"}/${listing.floor_number}`;

                    return (
                      <tr
                        key={listing._id}
                        onClick={() => router.push(`/admin/listings/${listing._id}`)}
                        className={cn(
                          "cursor-pointer border-b border-slate-100 text-slate-800 transition-colors hover:bg-slate-50",
                        )}
                      >
                        <td className="px-3 py-3 font-medium text-slate-900">{listingLabel}</td>
                        <td className="px-3 py-3 text-slate-700">{listing.society_name ?? "—"}</td>
                        <td className="px-3 py-3 font-medium tabular-nums text-slate-900">
                          {formatINR(listing.rent_monthly)}
                        </td>
                        <td className="px-3 py-3">
                          <ListingStatusBadge status={listing.status} />
                        </td>
                        <td className="px-3 py-3 text-slate-500">
                          {formatRelativeTime(listing._creationTime)}
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            href={`/admin/leads?status=VERIFIED`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!isLoading && results.length === 0 && (
          <div className="py-12 text-center">
            <FileSearch className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">
              No {statusFilter ? statusFilter.toLowerCase() : ""} listings
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Listings will appear here as you create them from verified leads.
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
