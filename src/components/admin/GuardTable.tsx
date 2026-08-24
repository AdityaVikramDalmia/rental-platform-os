"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { GUARD_TYPE, USER_STATUS } from "../../../lib/constants";
import { formatDate } from "../../../lib/dates";
import { formatPhoneDisplay } from "../../../lib/validators";
import { SortableHeader, type SortState } from "./SortableHeader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type GuardListItem = {
  user_id: Id<"users">;
  guard_profile_id: Id<"guard_profiles">;
  persona?: "GUARD" | "OPS";
  name: string;
  phone: string | undefined;
  status: string;
  guard_type: string;
  society_id: Id<"societies">;
  society_name: string | null;
  lead_count?: number;
  verified_rate?: number;
  _creationTime: number;
};

type GuardTableProps = {
  guards: GuardListItem[];
  isLoading: boolean;
  onVisibleAction?: (guards: GuardListItem[]) => void;
};

type GuardSortColumn = "name" | "lead_count" | "verified_rate" | "created";

const GUARD_TYPE_LABELS: Record<string, string> = {
  [GUARD_TYPE.BUILDING_SPECIFIC]: "Building",
  [GUARD_TYPE.MAIN_GATE]: "Main Gate",
  [GUARD_TYPE.PARK]: "Park",
  [GUARD_TYPE.ROVING]: "Roving",
};

const GUARD_TYPE_BADGE_CLASS: Record<string, string> = {
  [GUARD_TYPE.BUILDING_SPECIFIC]: "border-blue-200 bg-blue-50 text-blue-700",
  [GUARD_TYPE.MAIN_GATE]: "border-violet-200 bg-violet-50 text-violet-700",
  [GUARD_TYPE.PARK]: "border-emerald-200 bg-emerald-50 text-emerald-700",
  [GUARD_TYPE.ROVING]: "border-orange-200 bg-orange-50 text-orange-700",
};

function statusBadgeClassName(status: string): string {
  if (status === USER_STATUS.ACTIVE) {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (status === USER_STATUS.INACTIVE) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === USER_STATUS.BANNED) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

function formatVerifiedRate(rate: number | undefined, leadCount: number | undefined): string {
  if (leadCount === undefined || leadCount === 0) {
    return "\u2014";
  }

  if (rate === undefined) {
    return "\u2014";
  }

  return `${Math.round(rate)}%`;
}

function personaBadgeClassName(persona: "GUARD" | "OPS"): string {
  if (persona === "OPS") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

function GuardTableRow({ guard }: { guard: GuardListItem }) {
  const persona = guard.persona ?? "GUARD";
  const metrics = useQuery(
    api.guards.getMetrics,
    persona === "OPS"
      ? "skip"
      : {
          guard_user_id: guard.user_id,
          time_window: "all_time",
        },
  );

  const totalSubmitted = metrics?.total_submitted ?? guard.lead_count ?? 0;
  const hasInsufficientData = persona === "GUARD" && totalSubmitted < 5;
  const verifiedRate =
    metrics?.verified_rate !== null && metrics?.verified_rate !== undefined
      ? metrics.verified_rate
      : guard.verified_rate;
  const showHighRejectionWarning =
    metrics?.rejection_rate !== null &&
    metrics?.rejection_rate !== undefined &&
    metrics.rejection_rate > 50;

  return (
    <tr key={guard.user_id} className="border-b border-slate-100 text-slate-800">
      <td className="py-3 pr-3">
        <Link
          href={`/admin/guards/${guard.user_id}`}
          className="flex items-center gap-3 transition-colors hover:text-slate-700"
        >
          <Avatar size="default">
            <AvatarFallback className="bg-slate-100 text-xs font-medium text-slate-600">
              {getInitials(guard.name)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-slate-900 hover:underline">{guard.name}</span>
        </Link>
      </td>
      <td className="px-3 py-3 tabular-nums text-slate-600">
        {guard.phone ? formatPhoneDisplay(guard.phone) : "\u2014"}
      </td>
      <td className="px-3 py-3 text-slate-600">{guard.society_name ?? "\u2014"}</td>
      <td className="px-3 py-3">
        <Badge className={personaBadgeClassName(persona)}>{persona}</Badge>
      </td>
      <td className="px-3 py-3">
        <Badge
          className={
            GUARD_TYPE_BADGE_CLASS[guard.guard_type] ??
            "border-slate-200 bg-slate-100 text-slate-600"
          }
        >
          {GUARD_TYPE_LABELS[guard.guard_type] ?? guard.guard_type}
        </Badge>
      </td>
      <td className="px-3 py-3">
        <Badge className={statusBadgeClassName(guard.status)}>{guard.status}</Badge>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{totalSubmitted}</td>
      <td className="px-3 py-3 text-right tabular-nums">
        {hasInsufficientData ? (
          <span className="text-slate-500">Insufficient data</span>
        ) : (
          <span className="inline-flex items-center justify-end gap-1 text-slate-600">
            {formatVerifiedRate(verifiedRate, totalSubmitted)}
            {showHighRejectionWarning ? <span title="High rejection rate">⚠️</span> : null}
          </span>
        )}
      </td>
      <td className="px-3 py-3 text-slate-600">{formatDate(guard._creationTime)}</td>
    </tr>
  );
}

export function GuardTable({ guards, isLoading, onVisibleAction }: GuardTableProps) {
  const [currentSort, setCurrentSort] = useState<SortState>({
    column: "",
    direction: "asc",
  });
  const lastVisibleSignatureRef = useRef("");

  const sortedGuards = useMemo(() => {
    const sorted = [...guards];
    const sortColumn = currentSort.column as GuardSortColumn | "";

    if (!sortColumn) {
      return sorted;
    }

    sorted.sort((a, b) => {
      switch (sortColumn) {
        case "name":
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        case "lead_count":
          return (a.lead_count ?? 0) - (b.lead_count ?? 0);
        case "verified_rate":
          return (a.verified_rate ?? 0) - (b.verified_rate ?? 0);
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
  }, [currentSort.column, currentSort.direction, guards]);

  const visibleSignature = useMemo(
    () =>
      sortedGuards
        .map(
          (guard) =>
            `${guard.user_id}:${guard.status}:${guard.guard_type}:${guard.lead_count ?? ""}:${guard.verified_rate ?? ""}:${guard._creationTime}`,
        )
        .join("|"),
    [sortedGuards],
  );

  useEffect(() => {
    if (!onVisibleAction) {
      return;
    }

    if (lastVisibleSignatureRef.current === visibleSignature) {
      return;
    }

    lastVisibleSignatureRef.current = visibleSignature;
    onVisibleAction(sortedGuards);
  }, [onVisibleAction, sortedGuards, visibleSignature]);

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
                <SortableHeader
                  column="name"
                  label="Name"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                  className="py-2.5 pr-3"
                />
                <th className="px-3 py-2.5 font-medium">Phone</th>
                <th className="px-3 py-2.5 font-medium">Society</th>
                <th className="px-3 py-2.5 font-medium">Persona</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <SortableHeader
                  column="lead_count"
                  label="Leads"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                  className="text-right"
                />
                <SortableHeader
                  column="verified_rate"
                  label="Verified Rate"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                  className="text-right"
                />
                <SortableHeader
                  column="created"
                  label="Created"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                />
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? ["one", "two", "three", "four", "five"].map((skeletonKey) => (
                    <tr key={`guard-skeleton-${skeletonKey}`} className="border-b border-slate-100">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-8 rounded-full" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-36" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-28" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-6 w-16 rounded-full" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Skeleton className="ml-auto h-4 w-8" />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Skeleton className="ml-auto h-4 w-12" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    </tr>
                  ))
                : sortedGuards.map((guard) => <GuardTableRow key={guard.user_id} guard={guard} />)}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
