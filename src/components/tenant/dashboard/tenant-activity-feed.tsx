"use client";

import Link from "next/link";
import { CalendarDays, FileText, MessageSquare, Star } from "lucide-react";
import { formatRelativeTime } from "../../../../lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type TenantActivity = {
  activity_type: "INQUIRY" | "VISIT" | "FAVORITE" | "CHAT";
  label: string;
  timestamp: number;
  href: string;
};

type TenantActivityFeedProps = {
  activity?: TenantActivity[];
};

function ActivityIcon({ type }: { type: TenantActivity["activity_type"] }) {
  if (type === "INQUIRY") {
    return <FileText className="size-4 text-cyan-700" aria-hidden="true" />;
  }

  if (type === "VISIT") {
    return <CalendarDays className="size-4 text-emerald-700" aria-hidden="true" />;
  }

  if (type === "FAVORITE") {
    return <Star className="size-4 text-amber-600" aria-hidden="true" />;
  }

  return <MessageSquare className="size-4 text-violet-700" aria-hidden="true" />;
}

export function TenantActivityFeed({ activity }: TenantActivityFeedProps) {
  if (!activity) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {["one", "two", "three"].map((key) => (
            <div
              key={key}
              className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"
            >
              <Skeleton className="size-8 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-16" />
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
            href="/tenant/inquiries"
            className="text-xs font-medium text-cyan-700 hover:text-cyan-800"
          >
            Open Inquiries
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
            No activity yet. Start by browsing listings and submitting your first inquiry.
          </p>
        ) : (
          <ul className="space-y-3">
            {activity.map((entry, index) => (
              <li key={`${entry.activity_type}-${entry.timestamp}-${index}`}>
                <Link
                  href={entry.href}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 transition-colors hover:border-cyan-200 hover:bg-cyan-50/40"
                >
                  <span className="inline-flex size-8 items-center justify-center rounded-full bg-slate-100">
                    <ActivityIcon type={entry.activity_type} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{entry.label}</p>
                    <p className="text-xs text-slate-500">{formatRelativeTime(entry.timestamp)}</p>
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
