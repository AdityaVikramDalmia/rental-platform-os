"use client";

import { useQuery } from "convex/react";
import { Download, Loader2, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { CLOSURE_STATUS, PERMISSIONS, type ClosureStatus } from "../../../../../lib/constants";
import { ClosureTable, type ClosureTableItem } from "./components/closure-table";
import { ClosureFilters } from "./components/closure-filters";
import { RecordClosureDialog } from "./components/record-closure-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type CsvColumn, exportToCsv } from "@/lib/export-csv";
import { paiseToRupees } from "../../../../../lib/money";

export default function ClosuresPage() {
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

  const hasClosuresView = permissionSet.has(PERMISSIONS.CLOSURES_VIEW);
  const hasClosuresCreate = permissionSet.has(PERMISSIONS.CLOSURES_CREATE);
  const hasSocietiesView = permissionSet.has(PERMISSIONS.SOCIETIES_VIEW);
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [hasAppliedPrefillOpen, setHasAppliedPrefillOpen] = useState(false);
  const [visibleClosures, setVisibleClosures] = useState<ClosureTableItem[]>([]);

  const statusParam = searchParams.get("status");
  const societyParam = searchParams.get("society_id");
  const dateFromParam = searchParams.get("date_from");
  const dateToParam = searchParams.get("date_to");
  const prefillLeadIdParam = searchParams.get("lead_id");
  const prefillVisitIdParam = searchParams.get("visit_id");
  const prefillNegotiationIdParam = searchParams.get("negotiation_id");
  const prefillChecklistIdParam = searchParams.get("deal_checklist_id");

  const hasPrefillContext =
    prefillLeadIdParam !== null ||
    prefillVisitIdParam !== null ||
    prefillNegotiationIdParam !== null ||
    prefillChecklistIdParam !== null;

  // Open the record dialog once permissions resolve and the URL carries prefill
  // context. Adjusting state directly during render (rather than in an effect)
  // avoids an extra commit-then-effect-then-recommit render cascade; the
  // `hasAppliedPrefillOpen` flag still ensures this only fires once.
  if (hasClosuresCreate && hasPrefillContext && !hasAppliedPrefillOpen) {
    setHasAppliedPrefillOpen(true);
    setIsRecordOpen(true);
  }

  const validStatuses = new Set<string>(Object.values(CLOSURE_STATUS));
  const statusFilter =
    statusParam && validStatuses.has(statusParam) ? (statusParam as ClosureStatus) : undefined;
  const societyFilter = societyParam ? (societyParam as Id<"societies">) : undefined;
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
      router.replace(`/admin/closures?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleExportCsv = () => {
    const dateStamp = new Date().toISOString().split("T")[0];
    const columns: CsvColumn<ClosureTableItem>[] = [
      { label: "Flat Number", accessor: (row) => row.lead?.flat_number ?? "" },
      { label: "Building", accessor: (row) => row.building?.name ?? "" },
      { label: "Society", accessor: (row) => row.society?.name ?? "" },
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
        label: "Brokerage Tenant (₹)",
        accessor: "brokerage_tenant_side",
        formatter: (value) =>
          typeof value === "number" ? String(Math.round(paiseToRupees(value))) : "",
      },
      {
        label: "Brokerage Owner (₹)",
        accessor: "brokerage_owner_side",
        formatter: (value) =>
          typeof value === "number" ? String(Math.round(paiseToRupees(value))) : "",
      },
      {
        label: "Confirmed At",
        accessor: "confirmed_at",
        formatter: (value) =>
          typeof value === "number" ? new Date(value).toISOString().split("T")[0] : "",
      },
    ];

    exportToCsv(visibleClosures, columns, `closures-${dateStamp}.csv`);
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

  if (!hasClosuresView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view closures.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Closures</h2>
          <p className="text-sm text-slate-600">
            Record and manage deal closures &mdash; track brokerage, documents, and payouts.
          </p>
        </div>

        {hasClosuresCreate && (
          <Button
            type="button"
            onClick={() => setIsRecordOpen(true)}
            className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
          >
            <Plus className="size-4" />
            Record Closure
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <ClosureFilters
          status={statusFilter}
          societyId={societyFilter}
          dateFrom={dateFromFilter}
          dateTo={dateToFilter}
          onFilterChange={updateFilters}
          canViewSocieties={hasSocietiesView}
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

      <ClosureTable
        filters={{
          status: statusFilter,
          society_id: societyFilter,
          date_from: dateFromFilter,
          date_to: dateToFilter,
        }}
        onVisibleClosuresChange={setVisibleClosures}
      />

      {hasClosuresCreate && (
        <RecordClosureDialog open={isRecordOpen} onOpenChange={setIsRecordOpen} />
      )}
    </div>
  );
}
