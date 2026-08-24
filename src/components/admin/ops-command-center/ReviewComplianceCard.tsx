"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ReviewComplianceCardProps = {
  action: (agentId: string, agentName: string) => void;
};

function getComplianceTone(compliancePct: number): {
  textClassName: string;
  barClassName: string;
} {
  if (compliancePct >= 80) {
    return {
      textClassName: "text-emerald-700",
      barClassName: "bg-emerald-500",
    };
  }

  if (compliancePct >= 60) {
    return {
      textClassName: "text-amber-700",
      barClassName: "bg-amber-500",
    };
  }

  return {
    textClassName: "text-red-700",
    barClassName: "bg-red-500",
  };
}

export function ReviewComplianceCard({ action }: ReviewComplianceCardProps) {
  const compliance = useQuery(api.opsManagement.getReviewCompliance);

  if (compliance === undefined) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const tone = getComplianceTone(compliance.compliance_pct);
  const progressWidth = Math.min(100, Math.max(0, compliance.compliance_pct));

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base text-slate-900">Review Compliance</CardTitle>
        <p className="text-sm text-slate-600">
          {compliance.reviewed_count.toLocaleString("en-IN")} of{" "}
          {compliance.total_agents.toLocaleString("en-IN")} agents reviewed
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={cn("h-full rounded-full transition-all", tone.barClassName)}
              style={{ width: `${progressWidth}%` }}
            />
          </div>
          <p className={cn("text-sm font-semibold", tone.textClassName)}>
            {compliance.compliance_pct.toFixed(1)}% compliance
          </p>
        </div>

        {compliance.overdue_agents.length === 0 ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            All active OPS agents are within review cadence.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Overdue Agents ({compliance.overdue_count.toLocaleString("en-IN")})
            </p>
            <div className="space-y-2">
              {compliance.overdue_agents.map((agent) => (
                <div
                  key={agent.user_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 p-2"
                >
                  <div className="text-sm">
                    <p className="font-medium text-slate-900">{agent.name}</p>
                    <p className="text-xs text-slate-600">
                      {agent.days_since_last_checkin === null
                        ? "No check-ins yet"
                        : `${agent.days_since_last_checkin} days since last check-in`}
                    </p>
                  </div>
                  <Button type="button" size="sm" onClick={() => action(agent.user_id, agent.name)}>
                    Review Now
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
