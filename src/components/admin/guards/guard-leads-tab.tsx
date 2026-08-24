"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { FileText } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { LEAD_STATUS } from "../../../../lib/constants";
import { DAY_MS, formatDate } from "../../../../lib/dates";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const STATUS_FILTERS = [
  { label: "All", value: "ALL" },
  { label: "Submitted", value: LEAD_STATUS.SUBMITTED },
  { label: "Verified", value: LEAD_STATUS.VERIFIED },
  { label: "Rejected", value: LEAD_STATUS.REJECTED },
  { label: "Duplicate", value: LEAD_STATUS.DUPLICATE },
  { label: "Need Info", value: LEAD_STATUS.NEED_INFO },
] as const;

const LEADS_SKELETON_ROW_KEYS = ["one", "two", "three", "four", "five"] as const;
const LEADS_SKELETON_COL_KEYS = ["flat", "society", "status", "bounty", "date"] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

type GuardLeadsTabProps = {
  guardId: Id<"guard_profiles">;
  guardUserId: Id<"users">;
  workerLabel: string;
};

function formatMoneyFromPaise(amountPaise: number | undefined): string {
  if (amountPaise === undefined) {
    return "\u2014";
  }

  return INR_FORMATTER.format(amountPaise / 100);
}

function formatRate(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function GuardLeadsTab({ guardId, guardUserId, workerLabel }: GuardLeadsTabProps) {
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("ALL");
  const [nowMs] = useState(() => Date.now());
  const resolvedGuardUserId = guardUserId;

  const allLeads = useQuery(api.leads.list, {
    paginationOpts: { numItems: 500, cursor: null },
    guard_user_id: resolvedGuardUserId,
  });

  const filteredLeads = useQuery(api.leads.list, {
    paginationOpts: { numItems: 200, cursor: null },
    guard_user_id: resolvedGuardUserId,
    status: activeStatus === "ALL" ? undefined : activeStatus,
  });

  const resultRows = filteredLeads?.page ?? [];

  const stats = useMemo(() => {
    const allRows = allLeads?.page ?? [];
    const totalSubmitted = allRows.length;
    const verifiedCount = allRows.filter((lead) => lead.status === LEAD_STATUS.VERIFIED).length;
    const rejectedCount = allRows.filter((lead) => lead.status === LEAD_STATUS.REJECTED).length;

    if (totalSubmitted === 0) {
      return {
        totalSubmitted: 0,
        verifiedRate: 0,
        rejectedRate: 0,
        avgPerWeek: 0,
      };
    }

    const oldestTimestamp = allRows.reduce(
      (min, lead) => Math.min(min, lead._creationTime),
      nowMs,
    );
    const activeWeeks = Math.max(1, (nowMs - oldestTimestamp) / (7 * DAY_MS));

    return {
      totalSubmitted,
      verifiedRate: (verifiedCount / totalSubmitted) * 100,
      rejectedRate: (rejectedCount / totalSubmitted) * 100,
      avgPerWeek: totalSubmitted / activeWeeks,
    };
  }, [allLeads, nowMs]);

  const isLoading = allLeads === undefined || filteredLeads === undefined;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Submitted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{stats.totalSubmitted}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Verified Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">
              {formatRate(stats.verifiedRate)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Rejected Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">
              {formatRate(stats.rejectedRate)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Avg Leads / Week</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{stats.avgPerWeek.toFixed(1)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            variant={activeStatus === filter.value ? "default" : "outline"}
            className={
              activeStatus === filter.value
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "border-slate-300 text-slate-700"
            }
            onClick={() => setActiveStatus(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Flat</th>
                  <th className="px-3 py-2.5 font-medium">Society</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Bounty</th>
                  <th className="px-3 py-2.5 font-medium">Date Submitted</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? LEADS_SKELETON_ROW_KEYS.map((rowKey) => (
                      <tr
                        key={`guard-lead-skeleton-${rowKey}`}
                        className="border-b border-slate-100"
                      >
                        {LEADS_SKELETON_COL_KEYS.map((colKey) => (
                          <td key={`guard-lead-skeleton-${rowKey}-${colKey}`} className="px-3 py-3">
                            <Skeleton className="h-4 w-28" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : resultRows.map((lead) => (
                      <tr
                        key={lead._id}
                        className="border-b border-slate-100 text-slate-800 transition-colors hover:bg-slate-50"
                      >
                        <td className="px-3 py-3">
                          <Link
                            href={`/admin/leads?id=${lead._id}`}
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            <span className="text-slate-900">{lead.building_name ?? "\u2014"}</span>
                            <span className="text-slate-400">/ Fl{lead.floor_number} /</span>
                            <span className="font-medium text-slate-800">{lead.flat_number}</span>
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {lead.society_name ?? "\u2014"}
                        </td>
                        <td className="px-3 py-3">
                          <LeadStatusBadge status={lead.status} />
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatMoneyFromPaise(lead.prospective_bounty)}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatDate(lead._creationTime)}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {!isLoading && resultRows.length === 0 && (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-3 size-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">
                No leads submitted by this {workerLabel} yet.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
