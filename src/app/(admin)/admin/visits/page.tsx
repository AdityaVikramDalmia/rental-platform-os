"use client";

import { useQuery } from "convex/react";
import { Calendar, Download, Loader2, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PERMISSIONS, VISIT_STATUS, type VisitStatus } from "../../../../../lib/constants";
import { VisitTable, type VisitTableItem } from "./components/visit-table";
import { VisitFilters } from "./components/visit-filters";
import { ScheduleVisitDialog } from "./components/schedule-visit-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type CsvColumn, exportToCsv } from "@/lib/export-csv";

export default function VisitsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );

  const permissionSet = useMemo(() => {
    const permissions = new Set<string>();
    if (!roleAssignments) return permissions;
    for (const assignment of roleAssignments) {
      for (const permission of assignment.role.permissions) {
        permissions.add(permission);
      }
    }
    return permissions;
  }, [roleAssignments]);

  const hasVisitsView = permissionSet.has(PERMISSIONS.VISITS_VIEW);
  const hasVisitsCreate = permissionSet.has(PERMISSIONS.VISITS_CREATE);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [visibleVisits, setVisibleVisits] = useState<VisitTableItem[]>([]);

  const statusParam = searchParams.get("status");
  const societyParam = searchParams.get("society_id");
  const guardParam = searchParams.get("guard_id");
  const reassignParam = searchParams.get("needs_reassignment");
  const dateFromParam = searchParams.get("date_from");
  const dateToParam = searchParams.get("date_to");

  const validStatuses = new Set<string>(Object.values(VISIT_STATUS));
  const statusFilter =
    statusParam && validStatuses.has(statusParam) ? (statusParam as VisitStatus) : undefined;
  const societyFilter = societyParam ? (societyParam as Id<"societies">) : undefined;
  const guardFilter = guardParam ? (guardParam as Id<"users">) : undefined;
  const needsReassignmentFilter =
    reassignParam === "true" ? true : reassignParam === "false" ? false : undefined;
  const dateFromFilter = dateFromParam ? Number(dateFromParam) : undefined;
  const dateToFilter = dateToParam ? Number(dateToParam) : undefined;

  const updateFilters = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.replace(`/admin/visits?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleExportCsv = () => {
    const dateStamp = new Date().toISOString().split("T")[0];
    const columns: CsvColumn<VisitTableItem>[] = [
      {
        label: "Property",
        accessor: (row) => {
          const building = row.building?.name ?? "";
          const flat = row.lead?.flat_number ?? "";
          return building && flat ? `${building} / ${flat}` : building || flat;
        },
      },
      { label: "Society", accessor: (row) => row.society?.name ?? "" },
      { label: "Guard Name", accessor: (row) => row.guard?.name ?? "" },
      {
        label: "Status",
        accessor: "status",
        formatter: (value) =>
          String(value)
            .toLowerCase()
            .split("_")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" "),
      },
      {
        label: "Scheduled At",
        accessor: "scheduled_start",
        formatter: (value) => {
          if (typeof value !== "number") {
            return "";
          }

          const iso = new Date(value).toISOString();
          return `${iso.split("T")[0]} ${iso.slice(11, 16)}`;
        },
      },
      {
        label: "Outcome",
        accessor: "outcome",
        formatter: (value) => {
          if (value === "INTERESTED") return "Interested";
          if (value === "NOT_INTERESTED") return "Not Interested";
          if (value === "FOLLOWUP") return "Follow-up";
          return value ? String(value) : "";
        },
      },
    ];

    exportToCsv(visibleVisits, columns, `visits-${dateStamp}.csv`);
  };

  if (currentUser === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (
    !currentUser ||
    !(
      currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ??
      (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS")
    )
  ) {
    return null;
  }

  if (!hasVisitsView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view visits.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Visit Board</h2>
          <p className="text-sm text-slate-600">
            Schedule, track, and manage property visits &mdash; assign guards, monitor outcomes.
          </p>
        </div>

        {hasVisitsCreate && (
          <Button
            type="button"
            onClick={() => setIsScheduleOpen(true)}
            className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
          >
            <Plus className="size-4" />
            Schedule Visit
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <VisitFilters
          status={statusFilter}
          societyId={societyFilter}
          guardId={guardFilter}
          needsReassignment={needsReassignmentFilter}
          dateFrom={dateFromFilter}
          dateTo={dateToFilter}
          onFilterChange={updateFilters}
        />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                className="gap-1.5"
              >
                <Download className="size-4" />
                Export Visible Rows
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              Exports currently displayed rows only. Apply filters first for targeted exports.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <VisitTable
        filters={{
          status: statusFilter,
          society_id: societyFilter,
          assigned_guard_id: guardFilter,
          needs_reassignment: needsReassignmentFilter,
          date_from: dateFromFilter,
          date_to: dateToFilter,
        }}
        onVisibleVisitsChange={setVisibleVisits}
      />

      {hasVisitsCreate && (
        <ScheduleVisitDialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen} />
      )}
    </div>
  );
}
