"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { formatDate } from "../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableHeader, type SortState } from "./SortableHeader";

export type SocietyListItem = Doc<"societies"> & {
  building_count?: number;
  guard_count?: number;
  lead_count?: number;
};

type SocietyTableProps = {
  societies: SocietyListItem[];
  isLoading: boolean;
  onVisibleSocietiesAction?: (societies: SocietyListItem[]) => void;
};

type SocietySortColumn = "name" | "city" | "building_count" | "guard_count" | "created";

const SOCIETY_SKELETON_KEYS = ["one", "two", "three", "four", "five"] as const;

function compareText(a: string | undefined, b: string | undefined): number {
  return (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
}

function statusBadgeClassName(status: SocietyListItem["status"]): string {
  if (status === "ONBOARDING") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "ACTIVE") {
    return "border-green-200 bg-green-50 text-green-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

export function SocietyTable({
  societies,
  isLoading,
  onVisibleSocietiesAction,
}: SocietyTableProps) {
  const [currentSort, setCurrentSort] = useState<SortState>({
    column: "",
    direction: "asc",
  });
  const lastVisibleSignatureRef = useRef("");

  const sortedSocieties = useMemo(() => {
    const sorted = [...societies];
    const sortColumn = currentSort.column as SocietySortColumn | "";

    if (!sortColumn) {
      return sorted;
    }

    sorted.sort((a, b) => {
      switch (sortColumn) {
        case "name":
          return compareText(a.name, b.name);
        case "city":
          return compareText(a.city, b.city);
        case "building_count":
          return (a.building_count ?? 0) - (b.building_count ?? 0);
        case "guard_count":
          return (a.guard_count ?? 0) - (b.guard_count ?? 0);
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
  }, [currentSort.column, currentSort.direction, societies]);

  const visibleSignature = useMemo(
    () =>
      sortedSocieties
        .map(
          (society) =>
            `${society._id}:${society.status}:${society.building_count ?? ""}:${society.guard_count ?? ""}:${society.lead_count ?? ""}:${society._creationTime}`,
        )
        .join("|"),
    [sortedSocieties],
  );

  useEffect(() => {
    if (!onVisibleSocietiesAction) {
      return;
    }

    if (lastVisibleSignatureRef.current === visibleSignature) {
      return;
    }

    lastVisibleSignatureRef.current = visibleSignature;
    onVisibleSocietiesAction(sortedSocieties);
  }, [onVisibleSocietiesAction, sortedSocieties, visibleSignature]);

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
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <SortableHeader
                  column="name"
                  label="Name"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                  className="py-2.5 pr-3"
                />
                <SortableHeader
                  column="city"
                  label="City"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                />
                <th className="px-3 py-2.5 font-medium">Status</th>
                <SortableHeader
                  column="building_count"
                  label="Buildings"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                  className="text-right"
                />
                <SortableHeader
                  column="guard_count"
                  label="Guards"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                  className="text-right"
                />
                <th className="px-3 py-2.5 text-right font-medium">Leads</th>
                <SortableHeader
                  column="created"
                  label="Created"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                  className="py-2.5 pl-3 pr-0 text-right"
                />
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? SOCIETY_SKELETON_KEYS.map((skeletonKey) => (
                    <tr
                      key={`society-skeleton-${skeletonKey}`}
                      className="border-b border-slate-100"
                    >
                      <td className="py-3 pr-3">
                        <Skeleton className="h-4 w-44" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Skeleton className="ml-auto h-4 w-8" />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Skeleton className="ml-auto h-4 w-8" />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Skeleton className="ml-auto h-4 w-8" />
                      </td>
                      <td className="py-3 pl-3 pr-0 text-right">
                        <Skeleton className="ml-auto h-4 w-24" />
                      </td>
                    </tr>
                  ))
                : sortedSocieties.map((society) => (
                    <tr key={society._id} className="border-b border-slate-100 text-slate-800">
                      <td className="py-3 pr-3 font-medium">
                        <Link
                          href={`/admin/societies/${society._id}`}
                          className="text-slate-900 transition-colors hover:text-slate-700 hover:underline"
                        >
                          {society.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3">{society.city}</td>
                      <td className="px-3 py-3">
                        <Badge className={statusBadgeClassName(society.status)}>
                          {society.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right">{society.building_count ?? 0}</td>
                      <td className="px-3 py-3 text-right">{society.guard_count ?? 0}</td>
                      <td className="px-3 py-3 text-right">{society.lead_count ?? 0}</td>
                      <td className="py-3 pl-3 pr-0 text-right text-slate-600">
                        {formatDate(society._creationTime)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
