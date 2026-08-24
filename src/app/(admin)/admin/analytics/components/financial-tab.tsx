"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { ChartColumnIncreasing, HandCoins, Landmark, Loader2, Wallet } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { REFERRAL_STATUS_LABELS, REFERRAL_TYPE_LABELS } from "../../../../../../lib/constants";
import { formatINR } from "../../../../../../lib/money";
import type { TimeWindow } from "../page";
import { KpiCard } from "./kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type FinancialTabProps = {
  timeWindow: TimeWindow;
  hasPayoutsView: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function getReferralAnalyticsDateRange(timeWindow: TimeWindow): {
  date_from?: number;
  date_to?: number;
} {
  const now = Date.now();

  if (timeWindow === "last_7_days") {
    return { date_from: now - 7 * DAY_MS, date_to: now };
  }

  if (timeWindow === "last_30_days") {
    return { date_from: now - 30 * DAY_MS, date_to: now };
  }

  if (timeWindow === "last_90_days") {
    return { date_from: now - 90 * DAY_MS, date_to: now };
  }

  return {};
}

function formatNullableMoney(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return formatINR(value);
}

function formatNullableDays(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${value.toFixed(1)} days`;
}

function toMonthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export function FinancialTab({ timeWindow, hasPayoutsView }: FinancialTabProps) {
  const data = useQuery(
    api.analytics.getFinancialOverview,
    hasPayoutsView ? { time_window: timeWindow } : "skip",
  );
  const referralAnalytics = useQuery(
    api.referrals.getAnalytics,
    getReferralAnalyticsDateRange(timeWindow),
  );

  const trendData = useMemo(() => {
    if (!data?.monthly_trend) {
      return [];
    }

    return data.monthly_trend.map((item) => ({
      ...item,
      month_label: toMonthLabel(item.month),
    }));
  }, [data]);

  const referralTrendData = useMemo(() => {
    if (!referralAnalytics?.monthly_trend) {
      return [];
    }

    return referralAnalytics.monthly_trend.map((item) => ({
      ...item,
      month_label: toMonthLabel(item.month),
    }));
  }, [referralAnalytics]);

  if (!hasPayoutsView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You don&apos;t have permission to view financial data.
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-7 animate-spin text-slate-500" />
      </div>
    );
  }

  const breakdown = data.payout_breakdown;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Landmark}
          label="Total Brokerage"
          value={formatNullableMoney(data.total_brokerage_paise)}
        />
        <KpiCard
          icon={HandCoins}
          label="Total Guard Payouts"
          value={formatNullableMoney(data.total_payouts_paise)}
        />
        <KpiCard
          icon={Wallet}
          label="Net Revenue"
          value={formatNullableMoney(data.net_revenue_paise)}
        />
        <KpiCard
          icon={HandCoins}
          label="Avg Payout per Closure"
          value={formatNullableMoney(data.avg_payout_per_closure_paise)}
        />
        <KpiCard
          icon={ChartColumnIncreasing}
          label="Avg Days to Closure"
          value={formatNullableDays(data.avg_days_verified_to_closure)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-amber-700">
              Pending
            </p>
            <p className="text-lg font-semibold text-slate-900">
              {breakdown ? formatINR(breakdown.pending.total_paise) : "—"}
            </p>
            <p className="text-xs text-slate-600">
              {breakdown ? `${breakdown.pending.count} payouts` : "No data"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50 shadow-sm">
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-blue-700">
              Approved
            </p>
            <p className="text-lg font-semibold text-slate-900">
              {breakdown ? formatINR(breakdown.approved.total_paise) : "—"}
            </p>
            <p className="text-xs text-slate-600">
              {breakdown ? `${breakdown.approved.count} payouts` : "No data"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50/50 shadow-sm">
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-green-700">Paid</p>
            <p className="text-lg font-semibold text-slate-900">
              {breakdown ? formatINR(breakdown.disbursed.total_paise) : "—"}
            </p>
            <p className="text-xs text-slate-600">
              {breakdown ? `${breakdown.disbursed.count} payouts` : "No data"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-300 bg-slate-100/70 shadow-sm">
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-700">Voided</p>
            <p className="text-lg font-semibold text-slate-900">
              {breakdown ? formatINR(breakdown.voided.total_paise) : "—"}
            </p>
            <p className="text-xs text-slate-600">
              {breakdown ? `${breakdown.voided.count} payouts` : "No data"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Monthly Revenue vs Payouts</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
              No monthly financial trend available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month_label" tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  tickFormatter={(value: number) => `₹${Math.round(value / 100000) / 100}L`}
                />
                <Tooltip
                  formatter={(value: unknown, name: string | undefined) => {
                    const numeric = typeof value === "number" ? value : 0;
                    return [formatINR(numeric), name ?? "Value"];
                  }}
                />
                <Legend />
                <Bar
                  dataKey="brokerage_paise"
                  name="Revenue"
                  fill="#16a34a"
                  radius={[4, 4, 0, 0]}
                />
                <Bar dataKey="payouts_paise" name="Payouts" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Referral Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {referralAnalytics === undefined ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-slate-500" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  icon={ChartColumnIncreasing}
                  label="Total Referrals"
                  value={referralAnalytics.total_referrals.toLocaleString("en-IN")}
                />
                <KpiCard
                  icon={HandCoins}
                  label="Potential Referral Payout"
                  value={formatINR(referralAnalytics.total_potential_payout_paise)}
                />
                <KpiCard
                  icon={HandCoins}
                  label="Paid Referral Payout"
                  value={formatINR(referralAnalytics.total_paid_payout_paise)}
                />
                <KpiCard
                  icon={HandCoins}
                  label="Approved Referral Payout"
                  value={formatINR(referralAnalytics.total_approved_payout_paise)}
                />
                <KpiCard
                  icon={Wallet}
                  label="Unpaid Referral Payout"
                  value={formatINR(referralAnalytics.total_unpaid_payout_paise)}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Card className="border-slate-200 bg-slate-50/70 shadow-sm">
                  <CardContent className="space-y-1 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-600">
                      Codes Generated
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      {referralAnalytics.funnel_metrics.codes_generated.toLocaleString("en-IN")}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 bg-slate-50/70 shadow-sm">
                  <CardContent className="space-y-1 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-600">
                      Signups Captured
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      {referralAnalytics.funnel_metrics.signups_captured.toLocaleString("en-IN")}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 bg-slate-50/70 shadow-sm">
                  <CardContent className="space-y-1 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-600">
                      Deals Closed
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      {referralAnalytics.funnel_metrics.deals_closed.toLocaleString("en-IN")}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">Status Breakdown</p>
                  <div className="space-y-1.5 text-sm text-slate-600">
                    {Object.entries(referralAnalytics.status_breakdown).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between">
                        <span>
                          {
                            REFERRAL_STATUS_LABELS[
                              status as keyof typeof referralAnalytics.status_breakdown
                            ]
                          }
                        </span>
                        <span className="font-medium text-slate-900">
                          {count.toLocaleString("en-IN")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">Type Breakdown</p>
                  <div className="space-y-1.5 text-sm text-slate-600">
                    {Object.entries(referralAnalytics.type_breakdown).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between">
                        <span>
                          {
                            REFERRAL_TYPE_LABELS[
                              type as keyof typeof referralAnalytics.type_breakdown
                            ]
                          }
                        </span>
                        <div className="text-right text-xs">
                          <p className="font-medium text-slate-900">
                            {count.count.toLocaleString("en-IN")} referrals
                          </p>
                          <p className="text-slate-500">
                            Approved: {formatINR(count.approved_payout_paise)}
                          </p>
                          <p className="text-slate-500">
                            Paid: {formatINR(count.paid_payout_paise)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[540px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="px-3 py-2 font-medium">Month</th>
                      <th className="px-3 py-2 font-medium">Referrals</th>
                      <th className="px-3 py-2 font-medium">Paid Referral Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referralTrendData.map((item) => (
                      <tr key={item.month} className="border-b border-slate-100 text-slate-700">
                        <td className="px-3 py-2">{item.month_label}</td>
                        <td className="px-3 py-2">{item.referrals.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2">{formatINR(item.paid_payout_paise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
