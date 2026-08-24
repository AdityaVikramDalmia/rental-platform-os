"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PAYOUT_STATUS, type PayoutStatus } from "../../../../lib/constants";
import { formatDate } from "../../../../lib/dates";
import { PayoutStatusBadge } from "@/components/shared/payout-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const FILTERS = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: PAYOUT_STATUS.PENDING },
  { label: "Approved", value: PAYOUT_STATUS.APPROVED },
  { label: "Disbursed", value: PAYOUT_STATUS.DISBURSED },
  { label: "Failed", value: PAYOUT_STATUS.FAILED },
  { label: "Voided", value: PAYOUT_STATUS.VOIDED },
] as const;

const SUMMARY_SKELETON_KEYS = ["one", "two", "three", "four"] as const;
const PAYOUT_SKELETON_ROW_KEYS = ["one", "two", "three", "four", "five"] as const;
const PAYOUT_SKELETON_COL_KEYS = ["amount", "method", "status", "date", "reference"] as const;

type PayoutFilter = (typeof FILTERS)[number]["value"];

type GuardEarningsTabProps = {
  guardId: Id<"guard_profiles">;
  guardUserId?: Id<"users">;
  workerLabel: string;
};

function formatMoney(amountPaise: number): string {
  return INR_FORMATTER.format(amountPaise / 100);
}

function truncateText(value: string | undefined, maxLength: number): string {
  if (!value) {
    return "\u2014";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}\u2026` : value;
}

function formatMethod(value: string | undefined): string {
  if (!value) {
    return "\u2014";
  }

  return value.replace(/_/g, " ");
}

function toMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function toMonthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

export function GuardEarningsTab({ guardId, guardUserId, workerLabel }: GuardEarningsTabProps) {
  const [activeFilter, setActiveFilter] = useState<PayoutFilter>("ALL");

  const guardList = useQuery(api.guards.list, guardUserId ? "skip" : {});

  const resolvedGuardUserId = useMemo(() => {
    if (guardUserId) {
      return guardUserId;
    }

    return guardList?.find((guard) => guard.guard_profile_id === guardId)?.user_id;
  }, [guardId, guardList, guardUserId]);

  const payoutResponse = useQuery(
    api.payouts.list,
    resolvedGuardUserId
      ? {
          paginationOpts: { numItems: 500, cursor: null },
          guard_user_id: resolvedGuardUserId,
        }
      : "skip",
  );

  const payoutRows = payoutResponse?.page ?? [];
  const isLoading = resolvedGuardUserId === undefined || payoutResponse === undefined;

  const summary = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

    let totalEarned = 0;
    let pendingAmount = 0;
    let thisMonth = 0;
    let latestPaidAt: number | null = null;

    for (const row of payoutRows) {
      const payout = row.payout;

      if (payout.status === PAYOUT_STATUS.DISBURSED) {
        totalEarned += payout.amount_paise;
        latestPaidAt =
          latestPaidAt === null
            ? payout._creationTime
            : Math.max(latestPaidAt, payout._creationTime);

        if (payout._creationTime >= startOfMonth && payout._creationTime < endOfMonth) {
          thisMonth += payout.amount_paise;
        }
      }

      if (payout.status === PAYOUT_STATUS.PENDING || payout.status === PAYOUT_STATUS.APPROVED) {
        pendingAmount += payout.amount_paise;
      }
    }

    return {
      totalEarned,
      pendingAmount,
      thisMonth,
      latestPaidAt,
    };
  }, [payoutRows]);

  const filteredRows = useMemo(() => {
    const sortedRows = payoutRows
      .slice()
      .sort((a, b) => b.payout._creationTime - a.payout._creationTime);

    if (activeFilter === "ALL") {
      return sortedRows;
    }

    return sortedRows.filter((row) => row.payout.status === activeFilter);
  }, [activeFilter, payoutRows]);

  const chartData = useMemo(() => {
    const now = new Date();
    const monthKeys = Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return toMonthKey(monthDate);
    });

    const paidByMonth = new Map<string, number>(monthKeys.map((key) => [key, 0]));

    for (const row of payoutRows) {
      if (row.payout.status !== PAYOUT_STATUS.DISBURSED) {
        continue;
      }

      const monthKey = toMonthKey(new Date(row.payout._creationTime));
      if (paidByMonth.has(monthKey)) {
        paidByMonth.set(monthKey, (paidByMonth.get(monthKey) ?? 0) + row.payout.amount_paise);
      }
    }

    return monthKeys.map((key) => ({
      month: toMonthLabel(key),
      amountRupees: (paidByMonth.get(key) ?? 0) / 100,
    }));
  }, [payoutRows]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          SUMMARY_SKELETON_KEYS.map((skeletonKey) => (
            <Card
              key={`earnings-summary-skeleton-${skeletonKey}`}
              className="border-slate-200 bg-white shadow-sm"
            >
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-28" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Total Earned</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-slate-900">
                  {formatMoney(summary.totalEarned)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Pending Amount</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-slate-900">
                  {formatMoney(summary.pendingAmount)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">This Month</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-slate-900">
                  {formatMoney(summary.thisMonth)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Last Payout</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-slate-900">
                  {summary.latestPaidAt ? formatDate(summary.latestPaidAt) : "None yet"}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            variant={activeFilter === filter.value ? "default" : "outline"}
            className={
              activeFilter === filter.value
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "border-slate-300 text-slate-700"
            }
            onClick={() => setActiveFilter(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Payout History</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Type / Method</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Reference Notes</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? PAYOUT_SKELETON_ROW_KEYS.map((rowKey) => (
                      <tr
                        key={`earnings-table-skeleton-${rowKey}`}
                        className="border-b border-slate-100"
                      >
                        {PAYOUT_SKELETON_COL_KEYS.map((colKey) => (
                          <td
                            key={`earnings-table-skeleton-${rowKey}-${colKey}`}
                            className="px-3 py-3"
                          >
                            <Skeleton className="h-4 w-28" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : filteredRows.map((row) => (
                      <tr key={row.payout._id} className="border-b border-slate-100 text-slate-800">
                        <td className="px-3 py-3 text-slate-900">
                          {formatMoney(row.payout.amount_paise)}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatMethod(row.payout.method)}
                        </td>
                        <td className="px-3 py-3">
                          <PayoutStatusBadge status={row.payout.status as PayoutStatus} />
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatDate(row.payout._creationTime)}
                        </td>
                        <td className="max-w-[280px] truncate px-3 py-3 text-slate-700">
                          {truncateText(row.payout.payment_reference, 40)}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {!isLoading && payoutRows.length === 0 && (
            <p className="py-12 text-center text-sm font-medium text-slate-700">
              No payouts recorded for this {workerLabel} yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">
            Monthly Paid Breakdown (Last 6 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  tickFormatter={(value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`}
                />
                <Tooltip
                  formatter={(value: unknown) => {
                    const amount = typeof value === "number" ? value : 0;
                    return [INR_FORMATTER.format(amount), "Paid"];
                  }}
                />
                <Bar dataKey="amountRupees" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
