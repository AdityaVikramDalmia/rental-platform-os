"use client";

import { useQuery } from "convex/react";
import { Clock, FileCheck2, Home, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import {
  AGREEMENT_STATUS_LABELS,
  DEPOSIT_RECORD_STATUS_LABELS,
  KYC_PACKET_STATUS_LABELS,
  TOKEN_BOOKING_STATUS_LABELS,
  TRANSACTION_STATUS,
  type TransactionStatus,
} from "../../../../../lib/constants";
import { DAY_MS, formatDateTime } from "../../../../../lib/dates";
import { formatINR } from "../../../../../lib/money";
import { Badge } from "@/components/ui/badge";
import { TransactionStatusBadge } from "@/components/shared/transaction-status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const TERMINAL_STATUSES = new Set<TransactionStatus>([
  TRANSACTION_STATUS.COMPLETED,
  TRANSACTION_STATUS.CANCELLED,
]);

const STAGE_LABELS = ["KYC", "Agreement", "Token", "Deposit", "Move-in"] as const;

function getStageIndex(status: TransactionStatus): number {
  if (
    status === TRANSACTION_STATUS.INITIATED ||
    status === TRANSACTION_STATUS.KYC_PENDING ||
    status === TRANSACTION_STATUS.KYC_VERIFIED ||
    status === TRANSACTION_STATUS.KYC_REJECTED
  ) {
    return 0;
  }
  if (
    status === TRANSACTION_STATUS.AGREEMENT_PENDING ||
    status === TRANSACTION_STATUS.AGREEMENT_SENT ||
    status === TRANSACTION_STATUS.AGREEMENT_SIGNED
  ) {
    return 1;
  }
  if (status === TRANSACTION_STATUS.TOKEN_PENDING || status === TRANSACTION_STATUS.TOKEN_RECEIVED) {
    return 2;
  }
  if (
    status === TRANSACTION_STATUS.DEPOSIT_PENDING ||
    status === TRANSACTION_STATUS.DEPOSIT_RECEIVED
  ) {
    return 3;
  }
  if (status === TRANSACTION_STATUS.MOVE_IN_SCHEDULED) {
    return 4;
  }
  return 4;
}

function getStepDescription(status: TransactionStatus): string {
  const descriptions: Record<TransactionStatus, string> = {
    [TRANSACTION_STATUS.INITIATED]: "Transaction started. KYC will begin shortly.",
    [TRANSACTION_STATUS.KYC_PENDING]: "KYC checks are pending.",
    [TRANSACTION_STATUS.KYC_VERIFIED]: "KYC verified. Agreement drafting is next.",
    [TRANSACTION_STATUS.KYC_REJECTED]: "KYC failed. Awaiting re-submission/review.",
    [TRANSACTION_STATUS.AGREEMENT_PENDING]: "Agreement draft is being prepared.",
    [TRANSACTION_STATUS.AGREEMENT_SENT]: "Agreement sent for signatures.",
    [TRANSACTION_STATUS.AGREEMENT_SIGNED]: "Agreement signed. Token collection is next.",
    [TRANSACTION_STATUS.TOKEN_PENDING]: "Token payment details are pending.",
    [TRANSACTION_STATUS.TOKEN_RECEIVED]: "Token received. Deposit workflow is next.",
    [TRANSACTION_STATUS.DEPOSIT_PENDING]: "Deposit payment details are pending.",
    [TRANSACTION_STATUS.DEPOSIT_RECEIVED]: "Deposit received. Move-in scheduling is next.",
    [TRANSACTION_STATUS.MOVE_IN_SCHEDULED]: "Move-in checklist is in progress.",
    [TRANSACTION_STATUS.COMPLETED]: "Move-in completed successfully.",
    [TRANSACTION_STATUS.CANCELLED]: "Transaction cancelled.",
  };

  return descriptions[status];
}

function getDaysElapsed(startMs: number): number {
  return Math.max(0, Math.floor((Date.now() - startMs) / DAY_MS));
}

function formatListingName(transaction: {
  listing?: { slug?: string | undefined } | null;
  listing_id: Id<"listings">;
}): string {
  if (transaction.listing?.slug) {
    return transaction.listing.slug
      .split("-")
      .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
      .join(" ");
  }

  return `Listing ${transaction.listing_id.slice(-6)}`;
}

function DetailStatusBadge({ label, color }: { label: string; color: string }) {
  return <Badge className={cn("border-transparent", color)}>{label}</Badge>;
}

function getKycPacketStatusLabel(status: string | undefined): string {
  if (!status) {
    return "Not Started";
  }
  return KYC_PACKET_STATUS_LABELS[status as keyof typeof KYC_PACKET_STATUS_LABELS] ?? "Not Started";
}

export default function TenantTransactionsPage() {
  const [selectedId, setSelectedId] = useState<Id<"rental_transactions"> | null>(null);

  const currentUser = useQuery(api.users.getCurrentUser);
  const listResult = useQuery(
    api.rentalTransactions.listByTenant,
    currentUser?.user_type === "TENANT"
      ? {
          paginationOpts: { numItems: 100, cursor: null },
        }
      : "skip",
  );

  const transactions = listResult?.page ?? [];

  const [activeTransactions, pastTransactions] = useMemo(() => {
    const active = transactions.filter((item) => !TERMINAL_STATUSES.has(item.status));
    const past = transactions.filter((item) => TERMINAL_STATUSES.has(item.status));
    return [active, past];
  }, [transactions]);

  const selectedTransactionId =
    selectedId ?? activeTransactions[0]?._id ?? pastTransactions[0]?._id ?? null;

  const transactionDetail = useQuery(
    api.rentalTransactions.getById,
    selectedTransactionId ? { id: selectedTransactionId } : "skip",
  );

  if (
    currentUser === undefined ||
    (currentUser?.user_type === "TENANT" && listResult === undefined)
  ) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || currentUser.user_type !== "TENANT") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        This page is available only for tenants.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Transactions</h1>
        <p className="text-sm text-slate-600">
          Track your deal journey from KYC through agreement, payment confirmation, and move-in.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Active Transactions
        </h2>

        {activeTransactions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Home className="size-4" />
              No active transactions right now.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeTransactions.map((transaction) => {
              const stageIndex = getStageIndex(transaction.status);

              return (
                <Card
                  key={transaction._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(transaction._id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(transaction._id);
                    }
                  }}
                  className={cn(
                    "cursor-pointer transition-colors hover:border-indigo-300",
                    selectedTransactionId === transaction._id &&
                      "border-indigo-400 ring-2 ring-indigo-100",
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base text-slate-900">
                        {formatListingName(transaction)}
                      </CardTitle>
                      <TransactionStatusBadge status={transaction.status} />
                    </div>
                    <CardDescription>{getStepDescription(transaction.status)}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="flex flex-wrap gap-2">
                      {STAGE_LABELS.map((label, index) => (
                        <span
                          key={label}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            index < stageIndex && "bg-emerald-100 text-emerald-700",
                            index === stageIndex && "bg-indigo-100 text-indigo-700",
                            index > stageIndex && "bg-slate-100 text-slate-500",
                          )}
                        >
                          {label}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" />
                        {getDaysElapsed(transaction._creationTime)} days elapsed
                      </span>
                      <span>Updated: {formatDateTime(transaction.updated_at)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Past Transactions
        </h2>

        {pastTransactions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-sm text-slate-500">
              No completed or cancelled transactions yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {pastTransactions.map((transaction) => (
              <button
                type="button"
                key={transaction._id}
                onClick={() => setSelectedId(transaction._id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-indigo-300",
                  selectedTransactionId === transaction._id &&
                    "border-indigo-400 ring-2 ring-indigo-100",
                )}
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {formatListingName(transaction)}
                  </p>
                  <p className="text-xs text-slate-500">{getStepDescription(transaction.status)}</p>
                </div>
                <TransactionStatusBadge status={transaction.status} />
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedTransactionId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileCheck2 className="size-5 text-slate-600" />
              Transaction Detail
            </CardTitle>
            <CardDescription>
              Full lifecycle and readiness checks for this transaction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!transactionDetail ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Loading detail...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Listing</p>
                    <p className="text-sm font-medium text-slate-800">
                      {formatListingName(transactionDetail.transaction)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Rent / Deposit</p>
                    <p className="text-sm font-medium text-slate-800">
                      {formatINR(transactionDetail.transaction.monthly_rent_paise)} /{" "}
                      {formatINR(transactionDetail.transaction.deposit_amount_paise)}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Transaction</span>
                    <TransactionStatusBadge status={transactionDetail.transaction.status} />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">KYC</span>
                    <DetailStatusBadge
                      label={getKycPacketStatusLabel(transactionDetail.kyc_packet?.overall_status)}
                      color={
                        transactionDetail.kyc_packet
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Agreement</span>
                    <DetailStatusBadge
                      label={
                        transactionDetail.agreement
                          ? AGREEMENT_STATUS_LABELS[transactionDetail.agreement.status]
                          : "Not Started"
                      }
                      color={
                        transactionDetail.agreement
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-slate-100 text-slate-600"
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Token</span>
                    <DetailStatusBadge
                      label={
                        transactionDetail.token_booking
                          ? TOKEN_BOOKING_STATUS_LABELS[transactionDetail.token_booking.status]
                          : "Not Started"
                      }
                      color={
                        transactionDetail.token_booking
                          ? "bg-orange-100 text-orange-700"
                          : "bg-slate-100 text-slate-600"
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Deposit</span>
                    <DetailStatusBadge
                      label={
                        transactionDetail.deposit_record
                          ? DEPOSIT_RECORD_STATUS_LABELS[transactionDetail.deposit_record.status]
                          : "Not Started"
                      }
                      color={
                        transactionDetail.deposit_record
                          ? "bg-cyan-100 text-cyan-700"
                          : "bg-slate-100 text-slate-600"
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Move-in Checklist</span>
                    <DetailStatusBadge
                      label={
                        !transactionDetail.handover_checklist
                          ? "Not Created"
                          : transactionDetail.handover_checklist.completed_at
                            ? "Completed"
                            : "In Progress"
                      }
                      color={
                        !transactionDetail.handover_checklist
                          ? "bg-slate-100 text-slate-600"
                          : transactionDetail.handover_checklist.completed_at
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-purple-100 text-purple-700"
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
