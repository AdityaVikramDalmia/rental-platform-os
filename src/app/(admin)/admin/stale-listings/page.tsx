"use client";

import { useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import {
  FRESHNESS_STATE,
  FRESHNESS_STATE_COLORS,
  PERMISSIONS,
  TRUST_BADGE_CONFIG,
} from "../../../../../lib/constants";
import { formatDateTime, formatRelativeTime } from "../../../../../lib/dates";
import { SortableHeader, type SortState } from "@/components/admin/SortableHeader";
import { TrustBadgeChip } from "@/components/shared/trust-badge-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type FreshnessTab = "ALL" | "FRESH" | "AGING" | "STALE";

type StaleListingRow = {
  trust_row_id: string;
  listing_id: string;
  slug: string;
  title: string;
  status: string;
  society_name: string | null;
  building_name: string | null;
  freshness_score: number;
  freshness_state: "FRESH" | "AGING" | "STALE";
  badges: Array<{
    type: string;
    earned: boolean;
    timestamp?: number;
    count?: number;
  }>;
  badges_earned: string[];
  evidence?: {
    photo_count?: number;
    visit_count?: number;
    has_closure?: boolean;
  };
  last_activity_at?: number;
  last_computed_at: number;
  _creationTime: number;
};

const TABS: Array<{ key: FreshnessTab; label: string; state?: "FRESH" | "AGING" | "STALE" }> = [
  { key: "ALL", label: "All" },
  { key: "FRESH", label: "Fresh", state: FRESHNESS_STATE.FRESH },
  { key: "AGING", label: "Aging", state: FRESHNESS_STATE.AGING },
  { key: "STALE", label: "Stale", state: FRESHNESS_STATE.STALE },
];

type SortColumn =
  | "title"
  | "society"
  | "freshness_score"
  | "freshness_state"
  | "badges"
  | "last_activity_at"
  | "last_computed_at";

function compareNullableNumbers(left: number | undefined, right: number | undefined): number {
  const safeLeft = left ?? 0;
  const safeRight = right ?? 0;
  return safeLeft - safeRight;
}

function getCountForTab(
  counts:
    | {
        FRESH: number;
        AGING: number;
        STALE: number;
        total: number;
      }
    | null
    | undefined,
  tab: FreshnessTab,
): number {
  if (!counts) {
    return 0;
  }

  if (tab === "ALL") {
    return counts.total;
  }

  return counts[tab] ?? 0;
}

export default function StaleListingsPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );

  const permissionSet = useMemo(() => {
    const permissions = new Set<string>();
    if (!roleAssignments) {
      return permissions;
    }

    for (const assignment of roleAssignments) {
      for (const permission of assignment.role.permissions) {
        permissions.add(permission);
      }
    }

    return permissions;
  }, [roleAssignments]);

  const hasTrustBadgeView = permissionSet.has(PERMISSIONS.TRUST_BADGES_VIEW);

  if (currentUser === undefined || roleAssignments === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) {
    return null;
  }

  if (!hasTrustBadgeView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view listing trust freshness.
      </div>
    );
  }

  return <StaleListingsContent />;
}

function StaleListingsContent() {
  const [activeTab, setActiveTab] = useState<FreshnessTab>("STALE");
  const [selectedListing, setSelectedListing] = useState<StaleListingRow | null>(null);
  const [currentSort, setCurrentSort] = useState<SortState>({
    column: "freshness_score",
    direction: "desc",
  });

  const counts = useQuery(api.trustBadges.getFreshnessCounts, {});

  const { results, status, loadMore } = usePaginatedQuery(
    api.trustBadges.listStaleForAdmin,
    {
      freshness_state: activeTab === "ALL" ? undefined : activeTab,
    },
    { initialNumItems: 20 },
  );

  const rows = results as StaleListingRow[];
  const sortedRows = useMemo(() => {
    const sorted = [...rows];
    const sortColumn = currentSort.column as SortColumn;

    sorted.sort((left, right) => {
      switch (sortColumn) {
        case "title":
          return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
        case "society":
          return (left.society_name ?? "").localeCompare(right.society_name ?? "", undefined, {
            sensitivity: "base",
          });
        case "freshness_score":
          return left.freshness_score - right.freshness_score;
        case "freshness_state":
          return left.freshness_state.localeCompare(right.freshness_state, undefined, {
            sensitivity: "base",
          });
        case "badges":
          return left.badges_earned.length - right.badges_earned.length;
        case "last_activity_at":
          return compareNullableNumbers(left.last_activity_at, right.last_activity_at);
        case "last_computed_at":
          return left.last_computed_at - right.last_computed_at;
        default:
          return 0;
      }
    });

    if (currentSort.direction === "desc") {
      sorted.reverse();
    }

    return sorted;
  }, [currentSort.column, currentSort.direction, rows]);

  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  const handleSort = (column: string) => {
    setCurrentSort((previous) => {
      if (previous.column === column) {
        return {
          column,
          direction: previous.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        column,
        direction: "asc",
      };
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Stale Listings Queue
        </h2>
        <p className="text-sm text-slate-600">
          Review freshness decay and trust badge coverage for published listings.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = getCountForTab(counts, tab.key);

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                  isActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <SortableHeader
                    column="title"
                    label="Listing"
                    currentSort={currentSort}
                    onSortAction={handleSort}
                  />
                  <SortableHeader
                    column="society"
                    label="Society"
                    currentSort={currentSort}
                    onSortAction={handleSort}
                  />
                  <SortableHeader
                    column="freshness_score"
                    label="Freshness Score"
                    currentSort={currentSort}
                    onSortAction={handleSort}
                  />
                  <SortableHeader
                    column="freshness_state"
                    label="State"
                    currentSort={currentSort}
                    onSortAction={handleSort}
                  />
                  <SortableHeader
                    column="badges"
                    label="Badges Earned"
                    currentSort={currentSort}
                    onSortAction={handleSort}
                  />
                  <SortableHeader
                    column="last_activity_at"
                    label="Last Activity"
                    currentSort={currentSort}
                    onSortAction={handleSort}
                  />
                  <SortableHeader
                    column="last_computed_at"
                    label="Last Computed"
                    currentSort={currentSort}
                    onSortAction={handleSort}
                  />
                </tr>
              </thead>

              <tbody>
                {isLoading
                  ? ["a", "b", "c", "d", "e", "f", "g", "h"].map((rowId) => (
                      <tr
                        key={`stale-listing-skeleton-${rowId}`}
                        className="border-b border-slate-100"
                      >
                        <td className="px-3 py-3" colSpan={7}>
                          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                        </td>
                      </tr>
                    ))
                  : sortedRows.map((row) => (
                      <tr
                        key={row.trust_row_id}
                        onClick={() => setSelectedListing(row)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedListing(row);
                          }
                        }}
                        className="cursor-pointer border-b border-slate-100 text-slate-800 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <td className="px-3 py-3 font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            <span>{row.title}</span>
                            <Link
                              href={`/listing/${row.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-blue-700 hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              Open
                            </Link>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{row.society_name ?? "-"}</td>
                        <td className="px-3 py-3 font-semibold text-slate-900">
                          {row.freshness_score}
                        </td>
                        <td className="px-3 py-3">
                          <Badge className={FRESHNESS_STATE_COLORS[row.freshness_state]}>
                            {row.freshness_state}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">{row.badges_earned.length}</td>
                        <td className="px-3 py-3 text-slate-600">
                          {row.last_activity_at
                            ? formatRelativeTime(row.last_activity_at)
                            : "No activity"}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {formatRelativeTime(row.last_computed_at)}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {!isLoading && rows.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-600">
              No listings found for the selected freshness state.
            </div>
          )}

          {!isLoading && (
            <p className="pt-4 text-sm text-muted-foreground">
              Showing {rows.length} results{canLoadMore ? " (more available)" : ""}
            </p>
          )}

          {(canLoadMore || isLoadingMore) && (
            <div className="flex justify-center pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => loadMore(20)}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading..." : "Load More"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={selectedListing !== null}
        onOpenChange={(open) => !open && setSelectedListing(null)}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:w-[40vw] sm:max-w-none">
          {!selectedListing ? null : (
            <>
              <SheetHeader>
                <SheetTitle>{selectedListing.title}</SheetTitle>
                <SheetDescription>
                  {selectedListing.society_name ?? "Unknown society"} -{" "}
                  {selectedListing.building_name ?? "Unknown building"}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-5 px-4 pb-6">
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link
                      href={`/listing/${selectedListing.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Public Listing
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/listings/${selectedListing.listing_id}`}>
                      Open Admin Listing
                    </Link>
                  </Button>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <p className="text-xs text-slate-500">Freshness score</p>
                    <p className="text-2xl font-semibold text-slate-900">
                      {selectedListing.freshness_score}
                    </p>
                  </div>
                  <Badge className={FRESHNESS_STATE_COLORS[selectedListing.freshness_state]}>
                    {selectedListing.freshness_state}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Earned badges
                  </p>
                  <TrustBadgeChip badges={selectedListing.badges} maxBadges={6} />
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Photo count</p>
                    <p className="font-semibold text-slate-900">
                      {selectedListing.evidence?.photo_count ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Visit count</p>
                    <p className="font-semibold text-slate-900">
                      {selectedListing.evidence?.visit_count ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Closure history</p>
                    <p className="font-semibold text-slate-900">
                      {selectedListing.evidence?.has_closure ? "Available" : "Not available"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Last computed</p>
                    <p className="font-semibold text-slate-900">
                      {formatDateTime(selectedListing.last_computed_at)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Full badge breakdown
                  </p>
                  <div className="space-y-1.5">
                    {selectedListing.badges.map((badge) => {
                      const config = Object.entries(TRUST_BADGE_CONFIG).find(
                        ([badgeType]) => badgeType === badge.type,
                      )?.[1];

                      return (
                        <div key={badge.type} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{config?.label ?? badge.type}</span>
                          <span
                            className={cn(
                              "font-medium",
                              badge.earned ? "text-emerald-700" : "text-slate-400",
                            )}
                          >
                            {badge.earned ? "Earned" : "Not earned"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
