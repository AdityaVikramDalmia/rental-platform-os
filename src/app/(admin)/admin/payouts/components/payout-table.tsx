"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { CheckCircle, ExternalLink, HandCoins, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../../convex/_generated/dataModel";
import { PAYOUT_STATUS, type PayoutStatus } from "../../../../../../lib/constants";
import { formatINR } from "../../../../../../lib/money";
import { SLABadge } from "@/components/admin/SLABadge";
import { SortableHeader, type SortState } from "@/components/admin/SortableHeader";
import { PayoutStatusBadge } from "@/components/shared/payout-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PayoutStatusActions } from "./payout-status-actions";

const IST_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

type PaginationStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

type PayoutSortColumn = "amount" | "status" | "created";

export type PayoutListItem = {
  payout: Doc<"payouts">;
  sla_started_at_ms?: number;
  closure: Doc<"closures"> | null;
  lead: Doc<"leads"> | null;
  guard: Pick<Doc<"users">, "_id" | "name" | "phone" | "status"> | null;
  building: Doc<"buildings"> | null;
  society: Doc<"societies"> | null;
  approved_by_name: string | null;
  voided_by_name: string | null;
};

type PayoutTableProps = {
  payouts: PayoutListItem[];
  status: PaginationStatus;
  onLoadMore: () => void;
  canApprove?: boolean;
  canDisburse?: boolean;
  canVoid?: boolean;
  selectedIds: Set<Id<"payouts">>;
  onSelectionChange: (nextSelection: Set<Id<"payouts">>) => void;
  onVisiblePayoutsChange?: (payouts: PayoutListItem[]) => void;
};

function formatApprover(name: string | null): string {
  return name ?? "—";
}

export function PayoutTable({
  payouts,
  status,
  onLoadMore,
  canApprove = false,
  canDisburse = false,
  canVoid = false,
  selectedIds,
  onSelectionChange,
  onVisiblePayoutsChange,
}: PayoutTableProps) {
  const router = useRouter();
  const approvePayout = useMutation(api.payouts.approve);
  const voidPayout = useMutation(api.payouts.voidPayout);
  const [inlineLoading, setInlineLoading] = useState<{
    payoutId: Id<"payouts">;
    action: "approve" | "void";
  } | null>(null);

  const isLoading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const isLoadingMore = status === "LoadingMore";
  const hasMoreAvailable = status === "CanLoadMore";
  const [currentSort, setCurrentSort] = useState<SortState>({
    column: "",
    direction: "asc",
  });

  const sortedPayouts = useMemo(() => {
    const sorted = [...payouts];
    const sortColumn = currentSort.column as PayoutSortColumn | "";

    if (!sortColumn) {
      return sorted;
    }

    sorted.sort((a, b) => {
      switch (sortColumn) {
        case "amount":
          return a.payout.amount_paise - b.payout.amount_paise;
        case "status":
          return a.payout.status.localeCompare(b.payout.status, undefined, { sensitivity: "base" });
        case "created":
          return a.payout._creationTime - b.payout._creationTime;
        default:
          return 0;
      }
    });

    if (currentSort.direction === "desc") {
      sorted.reverse();
    }

    return sorted;
  }, [currentSort.column, currentSort.direction, payouts]);

  useEffect(() => {
    onVisiblePayoutsChange?.(sortedPayouts);
  }, [onVisiblePayoutsChange, sortedPayouts]);

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

  const visiblePayoutIds = useMemo(
    () => sortedPayouts.map((item) => item.payout._id),
    [sortedPayouts],
  );

  const selectedVisibleCount = useMemo(
    () => visiblePayoutIds.filter((payoutId) => selectedIds.has(payoutId)).length,
    [selectedIds, visiblePayoutIds],
  );

  const allVisibleSelected =
    visiblePayoutIds.length > 0 && selectedVisibleCount === visiblePayoutIds.length;
  const hasSomeVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const togglePayoutSelection = (payoutId: Id<"payouts">, checked: boolean) => {
    const nextSelection = new Set(selectedIds);

    if (checked) {
      nextSelection.add(payoutId);
    } else {
      nextSelection.delete(payoutId);
    }

    onSelectionChange(nextSelection);
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    const nextSelection = new Set(selectedIds);

    if (checked) {
      for (const payoutId of visiblePayoutIds) {
        nextSelection.add(payoutId);
      }
    } else {
      for (const payoutId of visiblePayoutIds) {
        nextSelection.delete(payoutId);
      }
    }

    onSelectionChange(nextSelection);
  };

  const handleApprove = useCallback(
    async (payoutId: Id<"payouts">) => {
      setInlineLoading({ payoutId, action: "approve" });
      try {
        await approvePayout({ id: payoutId });
        toast.success("Payout approved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to approve payout");
      } finally {
        setInlineLoading(null);
      }
    },
    [approvePayout],
  );

  const handleVoid = useCallback(
    async (payoutId: Id<"payouts">) => {
      setInlineLoading({ payoutId, action: "void" });
      try {
        await voidPayout({ id: payoutId, voided_reason: "Voided via inline action." });
        toast.success("Payout voided");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to void payout");
      } finally {
        setInlineLoading(null);
      }
    },
    [voidPayout],
  );

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1360px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="w-10 px-3 py-2.5 font-medium">
                  <Checkbox
                    checked={
                      allVisibleSelected ? true : hasSomeVisibleSelected ? "indeterminate" : false
                    }
                    onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                    aria-label="Select all payouts on this page"
                    disabled={visiblePayoutIds.length === 0}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">Guard</th>
                <th className="px-3 py-2.5 font-medium">Lead (Building / Flat)</th>
                <SortableHeader
                  column="amount"
                  label="Amount"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                />
                <th className="px-3 py-2.5 font-medium">Payment Reference</th>
                <SortableHeader
                  column="status"
                  label="Status"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                />
                <SortableHeader
                  column="created"
                  label="Created"
                  currentSort={currentSort}
                  onSortAction={handleSort}
                />
                <th className="px-3 py-2.5 font-medium">SLA</th>
                <th className="px-3 py-2.5 font-medium">Approved By</th>
                <th className="px-3 py-2.5 font-medium">Disbursed</th>
                <th className="w-40 px-2 py-2.5 font-medium" />
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr key={`payout-skeleton-${index}`} className="border-b border-slate-100">
                      {Array.from({ length: 11 }).map((__, colIdx) => (
                        <td key={`payout-skeleton-${index}-${colIdx}`} className="px-3 py-3">
                          <Skeleton className={colIdx === 7 ? "h-5 w-20" : "h-4 w-24"} />
                        </td>
                      ))}
                    </tr>
                  ))
                : sortedPayouts.map((item) => {
                    const buildingName = item.building?.name ?? "—";
                    const flatNumber = item.lead?.flat_number ?? "—";
                    const guardName = item.guard?.name ?? "—";
                    const isPending = item.payout.status === PAYOUT_STATUS.PENDING;
                    const isApproved = item.payout.status === PAYOUT_STATUS.APPROVED;
                    const canShowApprove = canApprove && isPending;
                    const canShowVoid = canVoid && (isPending || isApproved);
                    const isActionLoading = inlineLoading?.payoutId === item.payout._id;

                    return (
                      <tr
                        key={item.payout._id}
                        onClick={() => router.push(`/admin/payouts/${item.payout._id}`)}
                        className={cn(
                          "group cursor-pointer border-b border-slate-100 text-slate-800 transition-colors",
                          "hover:bg-slate-50",
                        )}
                      >
                        <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(item.payout._id)}
                            onCheckedChange={(checked) =>
                              togglePayoutSelection(item.payout._id, checked === true)
                            }
                            aria-label={`Select payout ${item.payout._id}`}
                          />
                        </td>
                        <td className="px-3 py-3 text-slate-700">{guardName}</td>
                        <td className="px-3 py-3">
                          <span className="text-slate-900">{buildingName}</span>
                          <span className="text-slate-400"> / </span>
                          <span className="font-medium text-slate-800">{flatNumber}</span>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatINR(item.payout.amount_paise)}
                        </td>
                        <td className="max-w-[240px] truncate px-3 py-3 text-slate-700">
                          {item.payout.payment_reference ?? "—"}
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
                            <PayoutStatusBadge status={item.payout.status as PayoutStatus} />
                            <PayoutStatusActions
                              payoutId={item.payout._id}
                              status={item.payout.status as PayoutStatus}
                              canApprove={false}
                              canDisburse={canDisburse}
                              canVoid={false}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {IST_DATE_FORMATTER.format(item.payout._creationTime)}
                        </td>
                        <td className="px-3 py-3">
                          <SLABadge
                            entity_type="payout"
                            sla_started_at_ms={item.sla_started_at_ms ?? item.payout._creationTime}
                          />
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatApprover(item.approved_by_name)}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {item.payout.disbursed_at
                            ? IST_DATE_FORMATTER.format(item.payout.disbursed_at)
                            : "—"}
                        </td>
                        <td
                          className="px-2 py-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <TooltipProvider delayDuration={500}>
                            <div className="flex items-center justify-end gap-0.5">
                              {canShowApprove ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleApprove(item.payout._id);
                                      }}
                                      disabled={isActionLoading}
                                      aria-label="Approve"
                                    >
                                      {isActionLoading && inlineLoading?.action === "approve" ? (
                                        <Loader2 className="size-4 animate-spin" />
                                      ) : (
                                        <CheckCircle className="size-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" sideOffset={6}>
                                    Approve
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}

                              {canShowVoid ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleVoid(item.payout._id);
                                      }}
                                      disabled={isActionLoading}
                                      aria-label="Void"
                                    >
                                      {isActionLoading && inlineLoading?.action === "void" ? (
                                        <Loader2 className="size-4 animate-spin" />
                                      ) : (
                                        <XCircle className="size-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" sideOffset={6}>
                                    Void
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}

                              <DropdownMenu>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={(event) => event.stopPropagation()}
                                        aria-label="Details"
                                      >
                                        <ExternalLink className="size-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" sideOffset={6}>
                                    Details
                                  </TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent align="end">
                                  {item.payout.guard_user_id ? (
                                    <DropdownMenuItem
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        router.push(`/admin/guards/${item.payout.guard_user_id}`);
                                      }}
                                    >
                                      View Guard
                                    </DropdownMenuItem>
                                  ) : null}
                                  {item.payout.lead_id ? (
                                    <DropdownMenuItem
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        router.push(`/admin/leads?id=${item.payout.lead_id}`);
                                      }}
                                    >
                                      View Lead
                                    </DropdownMenuItem>
                                  ) : null}
                                  {item.payout.closure_id ? (
                                    <DropdownMenuItem
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        router.push("/admin/closures");
                                      }}
                                    >
                                      View Closure
                                    </DropdownMenuItem>
                                  ) : null}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TooltipProvider>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!isLoading && payouts.length === 0 && (
          <div className="py-12 text-center">
            <HandCoins className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No payouts found</p>
            <p className="mt-1 text-sm text-slate-500">Payouts will appear here when created.</p>
          </div>
        )}

        {!isLoading && (
          <p className="pt-4 text-sm text-muted-foreground">
            Showing {payouts.length} results{hasMoreAvailable ? " (more available)" : ""}
          </p>
        )}

        {(canLoadMore || isLoadingMore) && (
          <div className="flex justify-center pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onLoadMore}
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
