"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { PERMISSIONS } from "../../../../../lib/constants";
import { DashboardAlertsAndActions } from "@/components/admin/dashboard/DashboardAlertsAndActions";
import { CRMSummaryCards } from "@/components/admin/dashboard/CRMSummaryCards";
import { DashboardErrorCard } from "@/components/admin/dashboard/DashboardErrorCard";
import { DashboardFunnelChart } from "@/components/admin/dashboard/DashboardFunnelChart";
import { DashboardKPICards } from "@/components/admin/dashboard/DashboardKPICards";
import { MorningBriefingCard } from "@/components/admin/dashboard/MorningBriefingCard";
import { DashboardRecentActivity } from "@/components/admin/dashboard/DashboardRecentActivity";
import { DashboardStatusBreakdowns } from "@/components/admin/dashboard/DashboardStatusBreakdowns";
import { TodaysVisitsCard } from "@/components/admin/dashboard/TodaysVisitsCard";
import { DashboardTrendChart } from "@/components/admin/dashboard/DashboardTrendChart";
import { FreshnessSummaryCard } from "@/components/admin/dashboard/FreshnessSummaryCard";
import {
  TimeWindowSelector,
  type DashboardTimeWindow,
} from "@/components/admin/dashboard/TimeWindowSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SectionBoundaryProps = {
  section: string;
  children: React.ReactNode;
};

type SectionBoundaryState = {
  hasError: boolean;
  retryKey: number;
};

class SectionErrorBoundary extends React.Component<SectionBoundaryProps, SectionBoundaryState> {
  state: SectionBoundaryState = {
    hasError: false,
    retryKey: 0,
  };

  static getDerivedStateFromError(): Pick<SectionBoundaryState, "hasError"> {
    return { hasError: true };
  }

  private handleRetry = () => {
    this.setState((previousState) => ({
      hasError: false,
      retryKey: previousState.retryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return <DashboardErrorCard section={this.props.section} action={this.handleRetry} />;
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}

export default function AdminDashboardPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );
  const [timeWindow, setTimeWindow] = useState<DashboardTimeWindow>("last_30_days");

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

  const hasAnalyticsView = permissionSet.has(PERMISSIONS.ANALYTICS_VIEW);
  const hasTrustBadgesView = permissionSet.has(PERMISSIONS.TRUST_BADGES_VIEW);

  if (currentUser === undefined || roleAssignments === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) {
    return null;
  }

  if (!hasAnalyticsView) {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Dashboard access restricted</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          You do not have permission to view analytics.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5 text-base">
      <SectionErrorBoundary section="morning briefing">
        <MorningBriefingCard />
      </SectionErrorBoundary>

      <div className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-600">
            Live operational overview for leads, visits, payouts, and team throughput.
          </p>
        </div>

        <TimeWindowSelector value={timeWindow} action={setTimeWindow} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionErrorBoundary section="KPI cards">
            <DashboardKPICards timeWindow={timeWindow} />
          </SectionErrorBoundary>

          <SectionErrorBoundary section="crm overview">
            <section className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">CRM Overview</h2>
                <p className="text-sm text-slate-600">
                  Live inquiry load across tenant, owner, and support workflows.
                </p>
              </div>
              <CRMSummaryCards />
            </section>
          </SectionErrorBoundary>

          <SectionErrorBoundary section="lead funnel">
            <DashboardFunnelChart timeWindow={timeWindow} />
          </SectionErrorBoundary>

          <SectionErrorBoundary section="trend chart">
            <DashboardTrendChart timeWindow={timeWindow} />
          </SectionErrorBoundary>
        </div>

        <div className="space-y-4">
          <SectionErrorBoundary section="alerts and quick actions">
            <DashboardAlertsAndActions timeWindow={timeWindow} />
          </SectionErrorBoundary>

          <SectionErrorBoundary section="status breakdowns">
            <DashboardStatusBreakdowns timeWindow={timeWindow} />
          </SectionErrorBoundary>

          {hasTrustBadgesView ? (
            <SectionErrorBoundary section="listing freshness summary">
              <FreshnessSummaryCard />
            </SectionErrorBoundary>
          ) : null}

          <SectionErrorBoundary section="today's visits">
            <TodaysVisitsCard />
          </SectionErrorBoundary>
        </div>
      </div>

      <SectionErrorBoundary section="recent activity">
        <DashboardRecentActivity />
      </SectionErrorBoundary>
    </div>
  );
}
