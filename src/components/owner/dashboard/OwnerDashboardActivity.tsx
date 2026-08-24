"use client";

import Link from "next/link";
import { formatRelativeTime } from "../../../../lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ActivityItem = {
  type: "closure" | "payout" | "check_in" | "lead" | "listing";
  timestamp: number;
  title: string;
  entity_id: string;
};

type OwnerDashboardActivityProps = {
  activity?: ActivityItem[];
};

function getDotClassName(type: ActivityItem["type"]): string {
  if (type === "closure") return "bg-green-500";
  if (type === "payout") return "bg-indigo-500";
  if (type === "check_in") return "bg-violet-500";
  return "bg-slate-400";
}

function getActivityHref(type: ActivityItem["type"]): string {
  if (type === "payout") return "/owner/earnings";
  if (type === "check_in") return "/owner/profile";
  return "/owner/properties";
}

export function OwnerDashboardActivity({ activity }: OwnerDashboardActivityProps) {
  if (!activity) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base text-slate-900">Recent Activity</CardTitle>
            <Skeleton className="h-4 w-14" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {["one", "two", "three", "four", "five"].map((key) => (
            <div key={`activity-skeleton-${key}`} className="flex items-center gap-3">
              <Skeleton className="size-2 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base text-slate-900">Recent Activity</CardTitle>
          <Link
            href="/owner/properties"
            className="text-xs font-medium text-indigo-700 hover:text-indigo-800"
          >
            View All
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="py-3 text-sm text-slate-500">No recent activity</p>
        ) : (
          <ul className="space-y-3">
            {activity.map((item) => (
              <li key={`${item.type}-${item.entity_id}`}>
                <Link
                  href={getActivityHref(item.type)}
                  className="flex items-start gap-3 rounded-lg px-1 py-0.5 transition-colors hover:bg-slate-50"
                >
                  <span
                    className={`mt-2 size-2 shrink-0 rounded-full ${getDotClassName(item.type)}`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">{formatRelativeTime(item.timestamp)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
