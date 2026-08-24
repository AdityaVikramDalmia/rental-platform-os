"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Download, HandCoins, Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PAYOUT_STATUS, PERMISSIONS, type PayoutStatus } from "../../../../../lib/constants";
import { BulkActionBar, type BulkAction } from "@/components/admin/BulkActionBar";
import { PayoutFilters } from "./components/payout-filters";
import { PayoutTable, type PayoutListItem } from "./components/payout-table";
import { CreatePayoutDialog } from "./components/create-payout-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type CsvColumn, exportToCsv } from "@/lib/export-csv";
import { paiseToRupees } from "../../../../../lib/money";

const VALID_PAYOUT_STATUSES = new Set<string>(Object.values(PAYOUT_STATUS));

function parseDateParam(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function PayoutsPage() {
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

  const hasPayoutsView = permissionSet.has(PERMISSIONS.PAYOUTS_VIEW);
  const hasPayoutsCreate = permissionSet.has(PERMISSIONS.PAYOUTS_CREATE);
  const hasPayoutsApprove = permissionSet.has(PERMISSIONS.PAYOUTS_APPROVE);
  const hasPayoutsDisburse = permissionSet.has(PERMISSIONS.PAYOUTS_DISBURSE);
  const hasPayoutsVoid = permissionSet.has(PERMISSIONS.PAYOUTS_VOID);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [visiblePayouts, setVisiblePayouts] = useState<PayoutListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"payouts">>>(new Set());
  const [bulkLoadingAction, setBulkLoadingAction] = useState<"approve" | "void" | null>(null);
  const [isBulkVoidDialogOpen, setIsBulkVoidDialogOpen] = useState(false);
  const approvePayout = useMutation(api.payouts.approve);
  const voidPayout = useMutation(api.payouts.voidPayout);
  const selectedCount = selectedIds.size;
  const isBulkLoading = bulkLoadingAction !== null;

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const statusParam = searchParams.get("status");
  const guardParam = searchParams.get("guard_user_id");
  const dateFromParam = searchParams.get("date_from");
  const dateToParam = searchParams.get("date_to");

  const selectedStatuses = useMemo(() => {
    if (!statusParam) {
      return [] as PayoutStatus[];
    }

    return Array.from(
      new Set(
        statusParam
          .split(",")
          .map((status) => status.trim())
          .filter((status): status is PayoutStatus => VALID_PAYOUT_STATUSES.has(status)),
      ),
    );
  }, [statusParam]);

  const singleStatusFilter = selectedStatuses.length === 1 ? selectedStatuses[0] : undefined;
  const guardFilter = guardParam ? (guardParam as Id<"users">) : undefined;
  const dateFromFilter = parseDateParam(dateFromParam);
  const dateToFilter = parseDateParam(dateToParam);

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

      router.replace(`/admin/payouts?${params.toString()}`, { scroll: false });
      clearSelection();
    },
    [clearSelection, router, searchParams],
  );

  useEffect(() => {
    clearSelection();
  }, [statusParam, guardParam, dateFromParam, dateToParam, clearSelection]);

  const queryArgs: {
    status?: PayoutStatus;
    guard_user_id?: Id<"users">;
    date_from?: number;
    date_to?: number;
  } = {};

  if (singleStatusFilter) queryArgs.status = singleStatusFilter;
  if (guardFilter) queryArgs.guard_user_id = guardFilter;
  if (dateFromFilter) queryArgs.date_from = dateFromFilter;
  if (dateToFilter) queryArgs.date_to = dateToFilter;

  const { results, status, loadMore } = usePaginatedQuery(api.payouts.list, queryArgs, {
    initialNumItems: 20,
  });

  const filteredResults = useMemo(() => {
    if (selectedStatuses.length <= 1) {
      return results;
    }

    return results.filter((item) => selectedStatuses.includes(item.payout.status as PayoutStatus));
  }, [results, selectedStatuses]);

  const runBulkApprove = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }

    setBulkLoadingAction("approve");
    try {
      await Promise.all(ids.map((payoutId) => approvePayout({ id: payoutId })));
      toast.success(`${ids.length} payouts approved`);
      clearSelection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve selected payouts");
    } finally {
      setBulkLoadingAction(null);
    }
  }, [approvePayout, clearSelection, selectedIds]);

  const runBulkVoid = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }

    setBulkLoadingAction("void");
    try {
      await Promise.all(
        ids.map((payoutId) =>
          voidPayout({ id: payoutId, voided_reason: "Voided via bulk action." }),
        ),
      );
      toast.success(`${ids.length} payouts voided`);
      clearSelection();
      setIsBulkVoidDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to void selected payouts");
    } finally {
      setBulkLoadingAction(null);
    }
  }, [clearSelection, selectedIds, voidPayout]);

  const bulkActions = useMemo<BulkAction[]>(() => {
    const actions: BulkAction[] = [];
    const terminalStatuses: PayoutStatus[] = [
      PAYOUT_STATUS.DISBURSED,
      PAYOUT_STATUS.FAILED,
      PAYOUT_STATUS.VOIDED,
    ];

    const hasNoStatusFilter = selectedStatuses.length === 0;
    const isPendingFilter =
      selectedStatuses.length === 1 && selectedStatuses[0] === PAYOUT_STATUS.PENDING;
    const isApprovedFilter =
      selectedStatuses.length === 1 && selectedStatuses[0] === PAYOUT_STATUS.APPROVED;
    const isTerminalFilter =
      selectedStatuses.length === 1 && terminalStatuses.includes(selectedStatuses[0]);

    const canShowApprove =
      hasPayoutsApprove &&
      (hasNoStatusFilter ||
        isPendingFilter ||
        (!isTerminalFilter &&
          selectedStatuses.length > 1 &&
          selectedStatuses.includes(PAYOUT_STATUS.PENDING)));

    const canShowVoid =
      hasPayoutsVoid &&
      (hasNoStatusFilter ||
        isPendingFilter ||
        isApprovedFilter ||
        (!isTerminalFilter &&
          selectedStatuses.length > 1 &&
          (selectedStatuses.includes(PAYOUT_STATUS.PENDING) ||
            selectedStatuses.includes(PAYOUT_STATUS.APPROVED))));

    if (canShowApprove) {
      actions.push({
        label: "Approve Selected",
        icon:
          bulkLoadingAction === "approve" ? <Loader2 className="size-4 animate-spin" /> : undefined,
        onClick: () => {
          void runBulkApprove();
        },
        disabled: isBulkLoading,
      });
    }

    if (canShowVoid) {
      actions.push({
        label: "Void Selected",
        variant: "outline",
        icon:
          bulkLoadingAction === "void" ? <Loader2 className="size-4 animate-spin" /> : undefined,
        onClick: () => setIsBulkVoidDialogOpen(true),
        disabled: isBulkLoading,
      });
    }

    return actions;
  }, [
    bulkLoadingAction,
    hasPayoutsApprove,
    hasPayoutsVoid,
    isBulkLoading,
    runBulkApprove,
    selectedStatuses,
  ]);

  const handleExportCsv = useCallback(() => {
    const dateStamp = new Date().toISOString().split("T")[0];
    const columns: CsvColumn<PayoutListItem>[] = [
      { label: "Guard Name", accessor: (row) => row.guard?.name ?? "" },
      {
        label: "Amount (₹)",
        accessor: (row) => row.payout.amount_paise,
        formatter: (value) =>
          typeof value === "number" ? String(Math.round(paiseToRupees(value))) : "",
      },
      {
        label: "Status",
        accessor: (row) => row.payout.status,
        formatter: (value) =>
          String(value)
            .toLowerCase()
            .split("_")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" "),
      },
      { label: "Method", accessor: (row) => row.payout.method ?? "" },
      {
        label: "Created At",
        accessor: (row) => row.payout._creationTime,
        formatter: (value) =>
          typeof value === "number" ? new Date(value).toISOString().split("T")[0] : "",
      },
    ];

    exportToCsv(visiblePayouts, columns, `payouts-${dateStamp}.csv`);
  }, [visiblePayouts]);

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

  if (!hasPayoutsView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view payouts.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Payouts</h2>
          <p className="text-sm text-slate-600">
            Track guard payouts end-to-end &mdash; create, approve, disburse, or close with failure
            and void actions.
          </p>
        </div>

        {hasPayoutsCreate && (
          <Button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
          >
            <Plus className="size-4" />
            Create Payout
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <PayoutFilters
          statuses={selectedStatuses}
          guardUserId={guardFilter}
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

      <PayoutTable
        payouts={filteredResults}
        status={status}
        onLoadMore={() => loadMore(20)}
        canApprove={hasPayoutsApprove}
        canDisburse={hasPayoutsDisburse}
        canVoid={hasPayoutsVoid}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onVisiblePayoutsChange={setVisiblePayouts}
      />

      <BulkActionBar
        selectedCount={selectedCount}
        actions={bulkActions}
        clearAction={() => {
          clearSelection();
          setIsBulkVoidDialogOpen(false);
        }}
      />

      <AlertDialog open={isBulkVoidDialogOpen} onOpenChange={setIsBulkVoidDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void {selectedCount} payouts?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void runBulkVoid();
              }}
              disabled={isBulkLoading}
            >
              {bulkLoadingAction === "void" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Voiding...
                </>
              ) : (
                "Confirm Void"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {hasPayoutsCreate && (
        <CreatePayoutDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      )}
    </div>
  );
}
