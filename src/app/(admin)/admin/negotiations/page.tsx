"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { PERMISSIONS } from "../../../../../lib/constants";
import { Button } from "@/components/ui/button";
import { type SortState } from "@/components/admin/SortableHeader";
import { NegotiationAnalyticsCards } from "./components/negotiation-analytics-cards";
import { NegotiationTable, type NegotiationSortBy } from "./components/negotiation-table";
import {
  NegotiationStatusTabs,
  type NegotiationStatusFilter,
} from "./components/negotiation-status-tabs";
import { NegotiationSearch } from "./components/negotiation-search";

const PAGE_SIZE = 20;

export default function NegotiationsPage() {
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

  const hasNegotiationsView = permissionSet.has(PERMISSIONS.NEGOTIATIONS_VIEW);

  const [activeStatus, setActiveStatus] = useState<NegotiationStatusFilter>("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortState, setSortState] = useState<SortState>({
    column: "last_activity_at",
    direction: "desc",
  });
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const resetKey = `${activeStatus}|${debouncedSearch}|${sortState.column}|${sortState.direction}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchInput]);

  // Reset pagination whenever the filter/search/sort combination changes.
  // Adjusting state directly during render (rather than in an effect) avoids
  // an extra commit-then-effect-then-recommit render cascade.
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setCursor(undefined);
    setCursorHistory([]);
  }

  const statusCounts = useQuery(api.negotiations.statusCounts, hasNegotiationsView ? {} : "skip");

  const queueData = useQuery(
    api.negotiations.listForAdmin,
    hasNegotiationsView
      ? {
          status_filter: activeStatus === "ALL" ? undefined : activeStatus,
          search: debouncedSearch || undefined,
          sort_by: sortState.column as NegotiationSortBy,
          sort_order: sortState.direction,
          cursor,
          limit: PAGE_SIZE,
        }
      : "skip",
  );

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

  if (!hasNegotiationsView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view negotiations.
      </div>
    );
  }

  const isLoading = queueData === undefined;
  const rows = queueData?.items ?? [];
  const hasMore = Boolean(queueData?.has_more);
  const totalCount = queueData?.total_count ?? 0;

  function handleSort(column: NegotiationSortBy) {
    setSortState((previous) => {
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
  }

  function goToNextPage() {
    if (!queueData?.next_cursor) {
      return;
    }

    setCursorHistory((previous) => [...previous, cursor ?? ""]);
    setCursor(queueData.next_cursor);
  }

  function goToPreviousPage() {
    setCursorHistory((previous) => {
      if (previous.length === 0) {
        return previous;
      }

      const next = [...previous];
      const previousCursor = next.pop();
      setCursor(previousCursor || undefined);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Negotiations</h2>
        <p className="text-sm text-slate-600">
          Track active negotiations, escalations, and room progress across tenant-owner workflows.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <NegotiationSearch value={searchInput} onChange={setSearchInput} />
        <p className="text-sm text-slate-500">
          {isLoading ? "Loading..." : `${rows.length} shown of ${totalCount}`}
        </p>
      </div>

      <NegotiationAnalyticsCards />

      <NegotiationStatusTabs
        activeStatus={activeStatus}
        counts={statusCounts ?? undefined}
        onChange={setActiveStatus}
      />

      <NegotiationTable
        rows={rows}
        isLoading={isLoading}
        sortState={sortState}
        onSort={handleSort}
      />

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={isLoading || cursorHistory.length === 0}
          onClick={goToPreviousPage}
        >
          Previous
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={isLoading || !hasMore}
          onClick={goToNextPage}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
