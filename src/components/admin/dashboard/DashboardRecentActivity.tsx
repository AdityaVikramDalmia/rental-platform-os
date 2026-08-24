"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import type { LeadStatus, PayoutStatus, VisitStatus } from "../../../../lib/constants";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";
import { PayoutStatusBadge } from "@/components/shared/payout-status-badge";
import { VisitStatusBadge } from "@/components/shared/visit-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Kolkata",
});

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatShortDate(timestamp: number): string {
  return SHORT_DATE_FORMATTER.format(new Date(timestamp));
}

function formatINRFromPaise(paise: number): string {
  return INR_FORMATTER.format(paise / 100);
}

function RowSkeletons() {
  return Array.from({ length: 3 }).map((_, index) => (
    <tr key={`dashboard-activity-skeleton-${index}`} className="border-b border-slate-100">
      <td className="px-3 py-2.5">
        <Skeleton className="h-4 w-28" />
      </td>
      <td className="px-3 py-2.5">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="px-3 py-2.5">
        <Skeleton className="h-6 w-24 rounded-full" />
      </td>
      <td className="px-3 py-2.5">
        <Skeleton className="h-4 w-16" />
      </td>
    </tr>
  ));
}

export function DashboardRecentActivity() {
  const router = useRouter();

  const leads = useQuery(api.leads.list, {
    paginationOpts: { numItems: 5, cursor: null },
  });

  const visits = useQuery(api.visits.list, {
    paginationOpts: { numItems: 5, cursor: null },
  });

  const payouts = useQuery(api.payouts.list, {
    paginationOpts: { numItems: 5, cursor: null },
  });

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base text-slate-900">Recent Leads</CardTitle>
          <Link
            href="/admin/leads?sort=newest"
            className="text-sm font-medium text-primary hover:underline"
          >
            View All →
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto px-3 pb-3">
            <table className="w-full min-w-[360px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.1em] text-slate-500">
                  <th className="px-3 py-2 font-medium">Flat</th>
                  <th className="px-3 py-2 font-medium">Society</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {leads === undefined
                  ? RowSkeletons()
                  : leads.page.length === 0
                    ? null
                    : leads.page.map((lead) => (
                        <tr
                          key={lead._id}
                          onClick={() => router.push(`/admin/leads?id=${lead._id}`)}
                          className={cn(
                            "cursor-pointer border-b border-slate-100 text-slate-800 transition-colors",
                            "hover:bg-slate-50",
                          )}
                        >
                          <td className="px-3 py-2.5">
                            <div className="max-w-[180px] truncate font-medium text-slate-900">
                              {lead.building_name ?? "—"} / {lead.flat_number}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{lead.society_name ?? "—"}</td>
                          <td className="px-3 py-2.5">
                            <LeadStatusBadge status={lead.status as LeadStatus} />
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {formatShortDate(lead._creationTime)}
                          </td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>
          {leads !== undefined && leads.page.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-slate-500">No recent leads</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base text-slate-900">Recent Visits</CardTitle>
          <Link
            href="/admin/visits?sort=newest"
            className="text-sm font-medium text-primary hover:underline"
          >
            View All →
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto px-3 pb-3">
            <table className="w-full min-w-[360px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.1em] text-slate-500">
                  <th className="px-3 py-2 font-medium">Property</th>
                  <th className="px-3 py-2 font-medium">Guard</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {visits === undefined
                  ? RowSkeletons()
                  : visits.page.length === 0
                    ? null
                    : visits.page.map((visit) => (
                        <tr
                          key={visit._id}
                          onClick={() => router.push("/admin/visits")}
                          className={cn(
                            "cursor-pointer border-b border-slate-100 text-slate-800 transition-colors",
                            "hover:bg-slate-50",
                          )}
                        >
                          <td className="px-3 py-2.5">
                            <div className="max-w-[180px] truncate font-medium text-slate-900">
                              {visit.building?.name ?? "—"} / {visit.lead?.flat_number ?? "—"}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{visit.guard?.name ?? "—"}</td>
                          <td className="px-3 py-2.5">
                            <VisitStatusBadge status={visit.status as VisitStatus} />
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {formatShortDate(visit.scheduled_start)}
                          </td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>
          {visits !== undefined && visits.page.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-slate-500">No recent visits</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base text-slate-900">Recent Payouts</CardTitle>
          <Link
            href="/admin/payouts?sort=newest"
            className="text-sm font-medium text-primary hover:underline"
          >
            View All →
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto px-3 pb-3">
            <table className="w-full min-w-[360px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.1em] text-slate-500">
                  <th className="px-3 py-2 font-medium">Guard</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {payouts === undefined
                  ? RowSkeletons()
                  : payouts.page.length === 0
                    ? null
                    : payouts.page.map((item) => (
                        <tr
                          key={item.payout._id}
                          onClick={() => router.push("/admin/payouts")}
                          className={cn(
                            "cursor-pointer border-b border-slate-100 text-slate-800 transition-colors",
                            "hover:bg-slate-50",
                          )}
                        >
                          <td className="px-3 py-2.5 text-slate-600">{item.guard?.name ?? "—"}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-900">
                            {formatINRFromPaise(item.payout.amount_paise)}
                          </td>
                          <td className="px-3 py-2.5">
                            <PayoutStatusBadge status={item.payout.status as PayoutStatus} />
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {formatShortDate(item.payout._creationTime)}
                          </td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>
          {payouts !== undefined && payouts.page.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-slate-500">No recent payouts</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
