"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { OWNER_LIFECYCLE_LABELS, OWNER_LIFECYCLE_STAGE } from "../../../../lib/constants";
import { formatRelativeTime } from "../../../../lib/dates";
import { formatPhoneDisplay } from "../../../../lib/validators";
import { SortableHeader, type SortState } from "../SortableHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type OwnerDoc = Doc<"owners">;

type GuardNameLookup = Record<string, string>;

type OwnerTableProps = {
  owners: OwnerDoc[];
  guardNames: GuardNameLookup;
  isLoading: boolean;
};

type OwnerSortColumn = "name" | "properties" | "last_activity";

const LIFECYCLE_BADGE_CLASS: Record<string, string> = {
  [OWNER_LIFECYCLE_STAGE.PROSPECT]: "border-slate-200 bg-slate-100 text-slate-600",
  [OWNER_LIFECYCLE_STAGE.VERIFIED]: "border-blue-200 bg-blue-50 text-blue-700",
  [OWNER_LIFECYCLE_STAGE.ACTIVE]: "border-green-200 bg-green-50 text-green-700",
  [OWNER_LIFECYCLE_STAGE.MANAGED]: "border-violet-200 bg-violet-50 text-violet-700",
  [OWNER_LIFECYCLE_STAGE.DORMANT]: "border-amber-200 bg-amber-50 text-amber-700",
  [OWNER_LIFECYCLE_STAGE.CHURNED]: "border-red-200 bg-red-50 text-red-700",
};

function OwnerTableRow({ owner, guardNames }: { owner: OwnerDoc; guardNames: GuardNameLookup }) {
  const rmName = owner.current_rm_guard_id
    ? (guardNames[owner.current_rm_guard_id] ?? "\u2014")
    : "\u2014";

  return (
    <tr className="border-b border-slate-100 text-slate-800">
      <td className="py-3 pr-3">
        <Link
          href={`/admin/owners/${owner._id}`}
          className="tabular-nums font-medium text-slate-900 hover:underline"
        >
          {formatPhoneDisplay(owner.phone)}
        </Link>
      </td>
      <td className="px-3 py-3 text-slate-600">{owner.name ?? "\u2014"}</td>
      <td className="px-3 py-3">
        <Badge
          className={
            LIFECYCLE_BADGE_CLASS[owner.lifecycle_stage] ??
            "border-slate-200 bg-slate-100 text-slate-600"
          }
        >
          {OWNER_LIFECYCLE_LABELS[owner.lifecycle_stage] ?? owner.lifecycle_stage}
        </Badge>
      </td>
      <td className="px-3 py-3 text-slate-600">{rmName}</td>
      <td className="px-3 py-3 text-right tabular-nums">{owner.active_properties_count}</td>
      <td className="px-3 py-3 text-slate-600">{formatRelativeTime(owner.last_activity_at)}</td>
    </tr>
  );
}

export function OwnerTable({ owners, guardNames, isLoading }: OwnerTableProps) {
  const [currentSort, setCurrentSort] = useState<SortState>({
    column: "",
    direction: "asc",
  });

  const sortedOwners = useMemo(() => {
    const sorted = [...owners];
    const sortColumn = currentSort.column as OwnerSortColumn | "";

    if (!sortColumn) {
      return sorted;
    }

    sorted.sort((a, b) => {
      switch (sortColumn) {
        case "name":
          return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
        case "properties":
          return a.active_properties_count - b.active_properties_count;
        case "last_activity":
          return a.last_activity_at - b.last_activity_at;
        default:
          return 0;
      }
    });

    if (currentSort.direction === "desc") {
      sorted.reverse();
    }

    return sorted;
  }, [currentSort.column, currentSort.direction, owners]);

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
          <table className="w-full min-w-[800px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-3 font-medium">Phone</th>
                <SortableHeader
                  column="name"
                  label="Name"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                />
                <th className="px-3 py-2.5 font-medium">Lifecycle</th>
                <th className="px-3 py-2.5 font-medium">Current RM</th>
                <SortableHeader
                  column="properties"
                  label="Properties"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                  className="text-right"
                />
                <SortableHeader
                  column="last_activity"
                  label="Last Activity"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                />
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`owner-skeleton-${index}`} className="border-b border-slate-100">
                      <td className="py-3 pr-3">
                        <Skeleton className="h-4 w-36" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-28" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Skeleton className="ml-auto h-4 w-8" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                    </tr>
                  ))
                : sortedOwners.map((owner) => (
                    <OwnerTableRow key={owner._id} owner={owner} guardNames={guardNames} />
                  ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
