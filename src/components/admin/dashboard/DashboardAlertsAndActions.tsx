"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CircleCheckBig,
  HandCoins,
  ShieldPlus,
  TriangleAlert,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { VISIT_STATUS } from "../../../../lib/constants";
import type { DashboardTimeWindow } from "./TimeWindowSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type DashboardAlertsAndActionsProps = {
  timeWindow: DashboardTimeWindow;
};

export function DashboardAlertsAndActions({ timeWindow }: DashboardAlertsAndActionsProps) {
  const leadStatusCounts = useQuery(api.leads.getStatusCounts, {});
  const visits = useQuery(api.visits.list, {
    paginationOpts: { numItems: 1000, cursor: null },
  });
  const financialOverview = useQuery(api.analytics.getFinancialOverview, {
    time_window: timeWindow,
  });
  const slaBreachCounts = useQuery(api.sla.getSLABreachCounts);

  const urgentCounts = useMemo(() => {
    if (!leadStatusCounts || !visits || !financialOverview) {
      return null;
    }

    const submittedLeads = leadStatusCounts.SUBMITTED ?? 0;
    const assignedVisits = visits.page.filter(
      (visit) => visit.status === VISIT_STATUS.ASSIGNED,
    ).length;
    const pendingPayouts = financialOverview.payout_breakdown?.pending?.count ?? 0;

    return {
      submittedLeads,
      assignedVisits,
      pendingPayouts,
    };
  }, [financialOverview, leadStatusCounts, visits]);

  const hasUrgentItems =
    urgentCounts !== null &&
    (urgentCounts.submittedLeads > 0 ||
      urgentCounts.assignedVisits > 0 ||
      urgentCounts.pendingPayouts > 0);

  const totalSLABreaches =
    (slaBreachCounts?.lead_breaches ?? 0) + (slaBreachCounts?.payout_breaches ?? 0);

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900">Alerts & Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {urgentCounts === null ? (
          <Skeleton className="h-[120px] w-full rounded-lg" />
        ) : hasUrgentItems ? (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-amber-800">
              <TriangleAlert className="size-4" />
              <p className="text-sm font-semibold">Action needed</p>
            </div>

            <ul className="space-y-1.5 text-sm text-amber-900">
              {urgentCounts.submittedLeads > 0 ? (
                <li>
                  {urgentCounts.submittedLeads.toLocaleString("en-IN")} leads awaiting verification.
                </li>
              ) : null}
              {urgentCounts.assignedVisits > 0 ? (
                <li>
                  {urgentCounts.assignedVisits.toLocaleString("en-IN")} visits need assignment
                  follow-up.
                </li>
              ) : null}
              {urgentCounts.pendingPayouts > 0 ? (
                <li>
                  {urgentCounts.pendingPayouts.toLocaleString("en-IN")} payouts pending approval.
                </li>
              ) : null}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2 text-green-800">
              <CircleCheckBig className="size-4" />
              <p className="text-sm font-semibold">All clear - no urgent items</p>
            </div>
          </div>
        )}

        {slaBreachCounts === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : totalSLABreaches > 0 ? (
          <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="size-4" />
              <p className="text-sm font-semibold">
                {`⚠️ ${totalSLABreaches.toLocaleString("en-IN")} SLA breach${totalSLABreaches > 1 ? "es" : ""}`}
              </p>
            </div>

            <div className="space-y-1.5 text-sm text-red-900">
              {slaBreachCounts.lead_breaches > 0 ? (
                <Link
                  href="/admin/leads?status=SUBMITTED"
                  className="block underline hover:no-underline"
                >
                  {`${slaBreachCounts.lead_breaches.toLocaleString("en-IN")} lead${slaBreachCounts.lead_breaches !== 1 ? "s" : ""} overdue for verification`}
                </Link>
              ) : null}

              {slaBreachCounts.payout_breaches > 0 ? (
                <Link
                  href="/admin/payouts?status=pending"
                  className="block underline hover:no-underline"
                >
                  {`${slaBreachCounts.payout_breaches.toLocaleString("en-IN")} payout${slaBreachCounts.payout_breaches !== 1 ? "s" : ""} overdue for processing`}
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button asChild variant="outline" className="justify-between">
            <Link href="/admin/leads?status=SUBMITTED">
              <span className="inline-flex items-center gap-2">
                <TriangleAlert className="size-4" />
                View Lead Queue
              </span>
              <ArrowRight className="size-4" />
            </Link>
          </Button>

          <Button asChild variant="outline" className="justify-between">
            <Link href="/admin/visits">
              <span className="inline-flex items-center gap-2">
                <CalendarCheck className="size-4" />
                View Visit Board
              </span>
              <ArrowRight className="size-4" />
            </Link>
          </Button>

          <Button asChild variant="outline" className="justify-between">
            <Link href="/admin/payouts?status=pending">
              <span className="inline-flex items-center gap-2">
                <HandCoins className="size-4" />
                View Payouts
              </span>
              <ArrowRight className="size-4" />
            </Link>
          </Button>

          <Button asChild variant="outline" className="justify-between">
            <Link href="/admin/guards">
              <span className="inline-flex items-center gap-2">
                <ShieldPlus className="size-4" />
                Create Guard
              </span>
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
