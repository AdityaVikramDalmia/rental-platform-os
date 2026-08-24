"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";
import { LEAD_STATUS, PAYOUT_STATUS, VISIT_STATUS } from "../../../../lib/constants";
import type { DashboardTimeWindow } from "./TimeWindowSelector";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";
import { PayoutStatusBadge } from "@/components/shared/payout-status-badge";
import { VisitStatusBadge } from "@/components/shared/visit-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type DashboardStatusBreakdownsProps = {
  timeWindow: DashboardTimeWindow;
};

const LEAD_STATUS_ORDER = [
  LEAD_STATUS.SUBMITTED,
  LEAD_STATUS.NEED_INFO,
  LEAD_STATUS.POTENTIAL_DUPLICATE,
  LEAD_STATUS.VERIFIED,
  LEAD_STATUS.REJECTED,
  LEAD_STATUS.DUPLICATE,
] as const;

const VISIT_STATUS_ORDER = [
  VISIT_STATUS.ASSIGNED,
  VISIT_STATUS.CONFIRMED,
  VISIT_STATUS.IN_PROGRESS,
  VISIT_STATUS.COMPLETED,
  VISIT_STATUS.CANCELLED,
  VISIT_STATUS.NO_SHOW,
] as const;

const PAYOUT_STATUS_ORDER = [
  PAYOUT_STATUS.PENDING,
  PAYOUT_STATUS.APPROVED,
  PAYOUT_STATUS.DISBURSED,
  PAYOUT_STATUS.FAILED,
  PAYOUT_STATUS.VOIDED,
] as const;

function SectionSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={`breakdown-skeleton-${index}`}
          className="flex items-center justify-between gap-2"
        >
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-4 w-10" />
        </div>
      ))}
    </div>
  );
}

export function DashboardStatusBreakdowns({ timeWindow }: DashboardStatusBreakdownsProps) {
  const leadStatusCounts = useQuery(api.leads.getStatusCounts, {});
  const visits = useQuery(api.visits.list, {
    paginationOpts: { numItems: 1000, cursor: null },
  });
  const financialOverview = useQuery(api.analytics.getFinancialOverview, {
    time_window: timeWindow,
  });

  const visitStatusCounts = useMemo(() => {
    if (!visits) {
      return null;
    }

    const counts: Record<string, number> = {
      [VISIT_STATUS.ASSIGNED]: 0,
      [VISIT_STATUS.CONFIRMED]: 0,
      [VISIT_STATUS.IN_PROGRESS]: 0,
      [VISIT_STATUS.COMPLETED]: 0,
      [VISIT_STATUS.CANCELLED]: 0,
      [VISIT_STATUS.NO_SHOW]: 0,
    };

    for (const visit of visits.page) {
      counts[visit.status] = (counts[visit.status] ?? 0) + 1;
    }

    return counts;
  }, [visits]);

  const payoutStatusCounts = useMemo(() => {
    if (!financialOverview?.payout_breakdown) {
      return null;
    }

    const breakdown = financialOverview.payout_breakdown;
    return {
      [PAYOUT_STATUS.PENDING]: breakdown[PAYOUT_STATUS.PENDING]?.count ?? 0,
      [PAYOUT_STATUS.APPROVED]: breakdown[PAYOUT_STATUS.APPROVED]?.count ?? 0,
      [PAYOUT_STATUS.DISBURSED]: breakdown[PAYOUT_STATUS.DISBURSED]?.count ?? 0,
      [PAYOUT_STATUS.FAILED]: breakdown[PAYOUT_STATUS.FAILED]?.count ?? 0,
      [PAYOUT_STATUS.VOIDED]: breakdown[PAYOUT_STATUS.VOIDED]?.count ?? 0,
    };
  }, [financialOverview]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Leads</CardTitle>
        </CardHeader>
        <CardContent>
          {leadStatusCounts === undefined ? (
            <SectionSkeleton />
          ) : (
            <div className="space-y-2">
              {LEAD_STATUS_ORDER.map((status) => (
                <Link
                  key={status}
                  href={`/admin/leads?status=${status}`}
                  className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                >
                  <LeadStatusBadge status={status} />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">
                      {(leadStatusCounts[status] ?? 0).toLocaleString("en-IN")}
                    </span>
                    <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Visits</CardTitle>
        </CardHeader>
        <CardContent>
          {visitStatusCounts === null ? (
            <SectionSkeleton />
          ) : (
            <div className="space-y-2">
              {VISIT_STATUS_ORDER.map((status) => (
                <Link
                  key={status}
                  href={`/admin/visits?status=${status}`}
                  className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                >
                  <VisitStatusBadge status={status} />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">
                      {(visitStatusCounts[status] ?? 0).toLocaleString("en-IN")}
                    </span>
                    <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Payouts</CardTitle>
        </CardHeader>
        <CardContent>
          {financialOverview === undefined ? (
            <SectionSkeleton />
          ) : (
            <div className="space-y-2">
              {PAYOUT_STATUS_ORDER.map((status) => (
                <Link
                  key={status}
                  href={`/admin/payouts?status=${status}`}
                  className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                >
                  <PayoutStatusBadge status={status} />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">
                      {(payoutStatusCounts?.[status] ?? 0).toLocaleString("en-IN")}
                    </span>
                    <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
