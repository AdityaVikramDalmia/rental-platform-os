"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  AGREEMENT_STATUS_LABELS,
  DEPOSIT_RECORD_STATUS_LABELS,
  KYC_PACKET_STATUS_LABELS,
  PERMISSIONS,
  TOKEN_BOOKING_STATUS_LABELS,
  TRANSACTION_STATUS,
  TRANSACTION_STATUS_LABELS,
  VALID_TRANSACTION_TRANSITIONS,
  type TransactionStatus,
} from "../../../../../lib/constants";
import { formatDateTime } from "../../../../../lib/dates";
import { formatINR } from "../../../../../lib/money";
import { TransactionStatusBadge } from "@/components/shared/transaction-status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type StatusGroupKey =
  | "ALL"
  | "KYC_PHASE"
  | "AGREEMENT_PHASE"
  | "TOKEN_DEPOSIT_PHASE"
  | "MOVE_IN"
  | "COMPLETED"
  | "CANCELLED";

type StatusGroup = {
  key: StatusGroupKey;
  label: string;
  statuses: readonly TransactionStatus[] | null;
};

const STATUS_GROUPS: readonly StatusGroup[] = [
  { key: "ALL", label: "All", statuses: null },
  {
    key: "KYC_PHASE",
    label: "KYC Phase",
    statuses: [
      TRANSACTION_STATUS.INITIATED,
      TRANSACTION_STATUS.KYC_PENDING,
      TRANSACTION_STATUS.KYC_VERIFIED,
      TRANSACTION_STATUS.KYC_REJECTED,
    ],
  },
  {
    key: "AGREEMENT_PHASE",
    label: "Agreement Phase",
    statuses: [
      TRANSACTION_STATUS.AGREEMENT_PENDING,
      TRANSACTION_STATUS.AGREEMENT_SENT,
      TRANSACTION_STATUS.AGREEMENT_SIGNED,
    ],
  },
  {
    key: "TOKEN_DEPOSIT_PHASE",
    label: "Token/Deposit Phase",
    statuses: [
      TRANSACTION_STATUS.TOKEN_PENDING,
      TRANSACTION_STATUS.TOKEN_RECEIVED,
      TRANSACTION_STATUS.DEPOSIT_PENDING,
      TRANSACTION_STATUS.DEPOSIT_RECEIVED,
    ],
  },
  {
    key: "MOVE_IN",
    label: "Move-In",
    statuses: [TRANSACTION_STATUS.MOVE_IN_SCHEDULED],
  },
  {
    key: "COMPLETED",
    label: "Completed",
    statuses: [TRANSACTION_STATUS.COMPLETED],
  },
  {
    key: "CANCELLED",
    label: "Cancelled",
    statuses: [TRANSACTION_STATUS.CANCELLED],
  },
] as const;

const STATUS_GROUP_QUERY_STATUS: Record<Exclude<StatusGroupKey, "ALL">, TransactionStatus> = {
  KYC_PHASE: TRANSACTION_STATUS.INITIATED,
  AGREEMENT_PHASE: TRANSACTION_STATUS.AGREEMENT_PENDING,
  TOKEN_DEPOSIT_PHASE: TRANSACTION_STATUS.TOKEN_PENDING,
  MOVE_IN: TRANSACTION_STATUS.MOVE_IN_SCHEDULED,
  COMPLETED: TRANSACTION_STATUS.COMPLETED,
  CANCELLED: TRANSACTION_STATUS.CANCELLED,
};

function getKycPacketStatusLabel(status: string | undefined): string {
  if (!status) {
    return "Not created";
  }
  return KYC_PACKET_STATUS_LABELS[status as keyof typeof KYC_PACKET_STATUS_LABELS] ?? "Not created";
}

function getAvailableTransitions(status: TransactionStatus): TransactionStatus[] {
  return VALID_TRANSACTION_TRANSITIONS[status] ?? [];
}

export default function TransactionsPage() {
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

  const hasTransactionsView = permissionSet.has(PERMISSIONS.TRANSACTIONS_VIEW);
  const hasTransactionsManage = permissionSet.has(PERMISSIONS.TRANSACTIONS_MANAGE);

  if (currentUser === undefined || roleAssignments === undefined) {
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

  if (!hasTransactionsView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view transactions.
      </div>
    );
  }

  return (
    <TransactionsBoard
      canManageTransactions={hasTransactionsManage}
      actorLabel={currentUser.name}
    />
  );
}

function TransactionsBoard({
  canManageTransactions,
  actorLabel,
}: {
  canManageTransactions: boolean;
  actorLabel: string;
}) {
  const [statusGroupKey, setStatusGroupKey] = useState<StatusGroupKey>(STATUS_GROUPS[0].key);
  const [selectedTransactionId, setSelectedTransactionId] =
    useState<Id<"rental_transactions"> | null>(null);
  const [transitioningTransactionId, setTransitioningTransactionId] =
    useState<Id<"rental_transactions"> | null>(null);

  const advanceTransactionStatus = useMutation(api.rentalTransactions.advanceStatus);
  const cancelTransaction = useMutation(api.rentalTransactions.cancel);

  const selectedStatusFilter: TransactionStatus | undefined =
    statusGroupKey === "ALL" ? undefined : STATUS_GROUP_QUERY_STATUS[statusGroupKey];

  const transactionQueryArgs = useMemo(
    () => (selectedStatusFilter === undefined ? {} : { status: selectedStatusFilter }),
    [selectedStatusFilter],
  );

  const {
    results,
    status: queryStatus,
    loadMore,
  } = usePaginatedQuery(api.rentalTransactions.listForAdmin, transactionQueryArgs, {
    initialNumItems: 20,
  });

  const selectedGroup =
    STATUS_GROUPS.find((group) => group.key === statusGroupKey) ?? STATUS_GROUPS[0];

  const detail = useQuery(
    api.rentalTransactions.getById,
    selectedTransactionId ? { id: selectedTransactionId } : "skip",
  );

  async function handleTransition(
    transactionId: Id<"rental_transactions">,
    currentStatus: TransactionStatus,
    targetStatus: TransactionStatus,
  ) {
    if (!canManageTransactions || currentStatus === targetStatus) {
      return;
    }

    const transitionLabel = `${TRANSACTION_STATUS_LABELS[currentStatus]} -> ${TRANSACTION_STATUS_LABELS[targetStatus]}`;
    const overrideReason = `Manual transition via admin transactions board by ${actorLabel}: ${transitionLabel}`;

    setTransitioningTransactionId(transactionId);
    try {
      if (targetStatus === TRANSACTION_STATUS.CANCELLED) {
        await cancelTransaction({
          transaction_id: transactionId,
          reason: overrideReason,
        });
      } else {
        await advanceTransactionStatus({
          transaction_id: transactionId,
          target_status: targetStatus,
          override_reason: overrideReason,
        });
      }

      toast.success(`Updated status to ${TRANSACTION_STATUS_LABELS[targetStatus]}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update transaction status";
      toast.error(message);
    } finally {
      setTransitioningTransactionId(null);
    }
  }

  return (
    <>
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Transactions</h2>
          <p className="text-sm text-slate-600">
            Track post-visit lifecycle from KYC to agreement, token, deposit, and move-in
            completion.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_GROUPS.map((group) => {
            const isActive = group.key === selectedGroup.key;
            const count = isActive ? results.length : null;

            return (
              <button
                key={group.key}
                type="button"
                onClick={() => {
                  setStatusGroupKey(group.key);
                  setSelectedTransactionId(null);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                {group.label}
                {count !== null ? (
                  <span
                    className={cn(
                      "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                      "bg-white/20 text-white",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Transaction</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Listing</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Rent / Deposit</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queryStatus === "LoadingFirstPage"
                ? ["a", "b", "c", "d", "e"].map((rowKey) => (
                    <tr key={`loading-row-${rowKey}`}>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-40" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-28" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-36" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-5 w-24" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-8 w-28" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-36" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-8 w-40" />
                      </td>
                    </tr>
                  ))
                : results.map((item) => (
                    <tr
                      key={item._id}
                      className={cn(
                        "cursor-pointer hover:bg-slate-50",
                        selectedTransactionId === item._id && "bg-blue-50 hover:bg-blue-50",
                      )}
                      onClick={() => setSelectedTransactionId(item._id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{item._id}</td>
                      <td className="px-4 py-3 text-slate-700">{item.tenant?.name ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.listing?.slug ? `/listing/${item.listing.slug}` : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <TransactionStatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatINR(item.monthly_rent_paise)} /{" "}
                        {formatINR(item.deposit_amount_paise)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDateTime(item.updated_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedTransactionId(item._id);
                            }}
                          >
                            View Details
                          </Button>

                          {canManageTransactions ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={(event) => event.stopPropagation()}
                                  disabled={
                                    getAvailableTransitions(item.status).length === 0 ||
                                    transitioningTransactionId === item._id
                                  }
                                >
                                  {transitioningTransactionId === item._id
                                    ? "Updating..."
                                    : "Advance"}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {getAvailableTransitions(item.status).length > 0 ? (
                                  getAvailableTransitions(item.status).map((targetStatus) => (
                                    <DropdownMenuItem
                                      key={`${item._id}-${targetStatus}`}
                                      disabled={
                                        transitioningTransactionId !== null ||
                                        targetStatus === item.status
                                      }
                                      onSelect={() => {
                                        void handleTransition(item._id, item.status, targetStatus);
                                      }}
                                    >
                                      {TRANSACTION_STATUS_LABELS[targetStatus]}
                                    </DropdownMenuItem>
                                  ))
                                ) : (
                                  <DropdownMenuItem disabled>
                                    No transitions available
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="text-xs text-slate-500">Read only</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              {queryStatus !== "LoadingFirstPage" && results.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                    No transactions found for this status group.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {queryStatus === "CanLoadMore" && (
          <Button type="button" variant="outline" onClick={() => loadMore(20)}>
            Load More
          </Button>
        )}
      </div>

      <Sheet
        open={selectedTransactionId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTransactionId(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:w-[40vw] sm:max-w-none">
          <SheetHeader>
            {!selectedTransactionId || detail === undefined ? (
              <>
                <SheetTitle className="sr-only">Loading transaction detail</SheetTitle>
                <SheetDescription className="sr-only">Please wait</SheetDescription>
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-4 w-40" />
              </>
            ) : detail ? (
              <>
                <div className="flex items-center gap-2">
                  <SheetTitle>Transaction #{detail.transaction._id.slice(-6)}</SheetTitle>
                  <TransactionStatusBadge status={detail.transaction.status} />
                </div>
                <SheetDescription>
                  Updated {formatDateTime(detail.transaction.updated_at)}
                </SheetDescription>
              </>
            ) : (
              <>
                <SheetTitle>Transaction</SheetTitle>
                <SheetDescription>Unable to load transaction details.</SheetDescription>
              </>
            )}
          </SheetHeader>

          {!selectedTransactionId || detail === undefined ? (
            <div className="space-y-4 px-4 py-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : detail ? (
            <div className="space-y-5 px-4 pb-6">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Core Details
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <InfoRow label="Tenant" value={detail.transaction.tenant?.name ?? "-"} />
                  <InfoRow label="Owner" value={detail.transaction.owner?.name ?? "-"} />
                  <InfoRow
                    label="Listing"
                    value={
                      detail.transaction.listing?.slug
                        ? `/listing/${detail.transaction.listing.slug}`
                        : "-"
                    }
                  />
                  <InfoRow label="Rent" value={formatINR(detail.transaction.monthly_rent_paise)} />
                  <InfoRow
                    label="Deposit"
                    value={formatINR(detail.transaction.deposit_amount_paise)}
                  />
                  <InfoRow
                    label="Move-in Date"
                    value={
                      detail.transaction.move_in_date
                        ? formatDateTime(detail.transaction.move_in_date)
                        : "Not set"
                    }
                  />
                  <InfoRow
                    label="Cancellation Reason"
                    value={detail.transaction.cancellation_reason ?? "-"}
                  />
                  <InfoRow
                    label="Current Status"
                    value={TRANSACTION_STATUS_LABELS[detail.transaction.status]}
                  />
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Sub-Entities
                </h3>
                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <InfoRow
                    label="KYC Packet"
                    value={getKycPacketStatusLabel(detail.kyc_packet?.overall_status)}
                  />
                  <InfoRow
                    label="Agreement"
                    value={
                      detail.agreement
                        ? AGREEMENT_STATUS_LABELS[detail.agreement.status]
                        : "Not created"
                    }
                  />
                  <InfoRow
                    label="Token Booking"
                    value={
                      detail.token_booking
                        ? TOKEN_BOOKING_STATUS_LABELS[detail.token_booking.status]
                        : "Not created"
                    }
                  />
                  <InfoRow
                    label="Deposit Record"
                    value={
                      detail.deposit_record
                        ? DEPOSIT_RECORD_STATUS_LABELS[detail.deposit_record.status]
                        : "Not created"
                    }
                  />
                  <InfoRow
                    label="Handover Checklist"
                    value={
                      detail.handover_checklist
                        ? detail.handover_checklist.completed_at
                          ? "Completed"
                          : "In progress"
                        : "Not created"
                    }
                  />
                </div>
              </section>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-500">{label}</span>
      <span className="ml-2 font-medium text-slate-900">{value}</span>
    </div>
  );
}
