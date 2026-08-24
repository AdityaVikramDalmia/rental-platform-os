"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertTriangle } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { OwnerDashboardActivity } from "@/components/owner/dashboard/OwnerDashboardActivity";
import { OwnerDashboardKpis } from "@/components/owner/dashboard/OwnerDashboardKpis";
import { OwnerDashboardQuickLinks } from "@/components/owner/dashboard/OwnerDashboardQuickLinks";
import { OwnerDashboardRmCard } from "@/components/owner/dashboard/OwnerDashboardRmCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type OwnerDashboardBoundaryProps = {
  children: React.ReactNode;
};

type OwnerDashboardBoundaryState = {
  hasError: boolean;
  retryKey: number;
};

class OwnerDashboardErrorBoundary extends React.Component<
  OwnerDashboardBoundaryProps,
  OwnerDashboardBoundaryState
> {
  state: OwnerDashboardBoundaryState = {
    hasError: false,
    retryKey: 0,
  };

  static getDerivedStateFromError(): Pick<OwnerDashboardBoundaryState, "hasError"> {
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
      return (
        <Card className="border-amber-200 bg-amber-50/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <AlertTriangle className="size-4" />
              Unable to load dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-amber-800">
            <p>Something went wrong while loading your dashboard data.</p>
            <Button
              type="button"
              variant="outline"
              onClick={this.handleRetry}
              className="border-amber-300 bg-white"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      );
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}

function getTimeGreeting(): "morning" | "afternoon" | "evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function OwnerDashboardContent() {
  const summary = useQuery(api.owners.getMyDashboardSummary);

  if (summary === undefined) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-48" />
        </div>

        <OwnerDashboardKpis />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <OwnerDashboardActivity />
          </div>
          <div>
            <OwnerDashboardRmCard />
          </div>
        </div>

        <OwnerDashboardQuickLinks />
      </div>
    );
  }

  const ownerName = summary.owner.name?.trim() || "Owner";

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Good {getTimeGreeting()}, {ownerName}
        </h1>
        <p className="text-sm text-slate-600">Here&apos;s your portfolio overview</p>
      </header>

      {summary.alerts.length > 0 ? (
        <section className="space-y-2">
          {summary.alerts.map((alert) => (
            <Card
              key={`${alert.type}-${alert.entity_id}`}
              className="border-amber-200 bg-amber-50/70"
            >
              <CardContent className="flex items-start gap-2 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-800">
                    {alert.type.replace(/_/g, " ")}
                  </p>
                  <p className="text-sm text-amber-900">{alert.message}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <OwnerDashboardKpis kpis={summary.kpis} />

      {summary.kpis.total_properties === 0 ? (
        <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-sm">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold text-slate-900">Add your first property</p>
            <p className="text-sm text-slate-600">
              Share your property details with us and we will help you find verified tenants.
            </p>
            <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
              <Link href="/owner/service-requests">Start onboarding</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <OwnerDashboardActivity activity={summary.recent_activity} />
        </div>
        <div>
          <OwnerDashboardRmCard rmContact={summary.rm_contact} />
        </div>
      </div>

      <OwnerDashboardQuickLinks />
    </div>
  );
}

export default function OwnerDashboardPage() {
  return (
    <OwnerDashboardErrorBoundary>
      <OwnerDashboardContent />
    </OwnerDashboardErrorBoundary>
  );
}
