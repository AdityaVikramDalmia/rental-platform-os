"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function formatDate(timestamp: number | null): string {
  if (timestamp === null) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function OpenActionItemsPanel() {
  const data = useQuery(api.opsManagement.getOpenActionItems);

  if (data === undefined) {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Open Action Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data.total_open_items === 0) {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Open Action Items</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">No open action items.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border border-slate-200 bg-white">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base text-slate-900">
          Open Action Items ({data.total_open_items})
        </CardTitle>
        <p className="text-xs text-slate-500">
          Incomplete commitments from the last 90 days, grouped by agent.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {data.groups.map((group) => (
          <section
            key={group.agent_user_id}
            className="space-y-2 rounded-lg border border-slate-200 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900">{group.agent_name}</h4>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-slate-300 text-slate-700">
                  {group.items.length} open
                </Badge>
                {group.overdue_count > 0 ? (
                  <Badge className="bg-red-100 text-red-700">{group.overdue_count} overdue</Badge>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              {group.items.map((item, index) => (
                <div
                  key={`${item.check_in_id}-${index + 1}`}
                  className={cn(
                    "rounded-md border border-slate-200 p-2",
                    item.overdue ? "bg-red-50" : "bg-slate-50",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm text-slate-900">{item.description}</p>
                    {item.overdue ? (
                      <Badge className="bg-red-100 text-red-700">Overdue</Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span>Due: {formatDate(item.due_date)}</span>
                    <span>Source check-in: {formatDateTime(item.check_in_created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
