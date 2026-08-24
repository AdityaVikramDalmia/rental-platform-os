"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function NegotiationAnalyticsCards() {
  const analytics = useQuery(api.negotiations.negotiationAnalytics, {});

  if (analytics === undefined) {
    const skeletonKeys = ["total-active", "avg-days", "avg-rounds", "stale-rate", "flagged"];

    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {skeletonKeys.map((key) => (
          <Card
            key={`negotiation-analytics-skeleton-${key}`}
            className="border-slate-200 bg-white py-0"
          >
            <CardHeader className="px-4 py-3">
              <Skeleton className="h-4 w-36" />
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-4 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const isEmpty = analytics.total_negotiations === 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Total / Active"
        value={`${analytics.total_negotiations.toLocaleString("en-IN")} / ${analytics.active_negotiations.toLocaleString("en-IN")}`}
        hint="Negotiations"
      />
      <MetricCard
        label="Avg Days to Close"
        value={analytics.avg_days_to_close.toFixed(2)}
        hint="days"
      />
      <MetricCard
        label="Avg Proposal Rounds"
        value={analytics.avg_proposal_rounds.toFixed(2)}
        hint="rounds"
      />
      <MetricCard
        label="Stale Rate"
        value={`${analytics.stale_rate.toFixed(2)}%`}
        hint="of active"
      />
      <MetricCard
        label="Flagged Count"
        value={analytics.flagged_count.toLocaleString("en-IN")}
        hint="non-dismissed"
      />

      {isEmpty ? (
        <Card className="border-slate-200 bg-white py-0 sm:col-span-2 xl:col-span-4">
          <CardContent className="px-4 py-4 text-sm text-slate-500">
            No negotiations found yet. Metrics will populate once negotiations are created.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="border-slate-200 bg-white py-0">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-4 pb-4">
        <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </CardContent>
    </Card>
  );
}
