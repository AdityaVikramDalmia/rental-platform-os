"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const CELEBRATION_ICON: Record<"closure" | "target_exceeded" | "quality_high", string> = {
  closure: "🎉",
  target_exceeded: "🎯",
  quality_high: "⭐",
};

export function CelebrationsPanel() {
  const celebrations = useQuery(api.opsManagement.getCelebrations);

  if (celebrations === undefined) {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">Recent Wins</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {["celebration-skeleton-1", "celebration-skeleton-2", "celebration-skeleton-3"].map(
            (key) => (
              <div
                key={key}
                className="flex items-start gap-3 rounded-lg border border-slate-100 p-3"
              >
                <Skeleton className="size-5 rounded-full" />
                <div className="w-full space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ),
          )}
        </CardContent>
      </Card>
    );
  }

  if (celebrations.length === 0) {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">Recent Wins</CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-sm text-slate-600">
          🏆 No celebrations this week
        </CardContent>
      </Card>
    );
  }

  const visibleItems = celebrations.slice(0, 10);
  const hiddenCount = Math.max(0, celebrations.length - visibleItems.length);

  return (
    <Card className="rounded-xl border border-slate-200 bg-white">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">Recent Wins</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3"
            >
              <span className="text-base leading-none">{CELEBRATION_ICON[item.type]}</span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm text-slate-800">
                  <span className="font-semibold text-slate-900">{item.agent_name}</span>{" "}
                  {item.description}
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}</span>
                  {item.link_href ? (
                    <>
                      <span aria-hidden="true">•</span>
                      <Link
                        href={item.link_href}
                        className="font-medium text-slate-700 hover:text-slate-900"
                      >
                        View details
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        {hiddenCount > 0 ? (
          <p className="text-xs text-slate-500">Showing 10 of {celebrations.length} celebrations</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
