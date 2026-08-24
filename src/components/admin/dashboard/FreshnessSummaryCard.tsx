"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { FRESHNESS_STATE, FRESHNESS_STATE_COLORS } from "../../../../lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function FreshnessSummaryCard() {
  const counts = useQuery(api.trustBadges.getFreshnessCounts, {});

  if (counts === undefined) {
    return (
      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <AlertTriangle className="size-4 text-amber-600" />
            Listing Freshness
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3 text-sm">
          <div className="space-y-2">
            {["fresh", "aging", "stale"].map((stateKey) => (
              <div
                key={`freshness-summary-skeleton-${stateKey}`}
                className="flex items-center justify-between"
              >
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-8" />
              </div>
            ))}
          </div>
          <Skeleton className="h-5 w-44" />
        </CardContent>
      </Card>
    );
  }

  const freshCount = counts[FRESHNESS_STATE.FRESH] ?? 0;
  const agingCount = counts[FRESHNESS_STATE.AGING] ?? 0;
  const staleCount = counts[FRESHNESS_STATE.STALE] ?? 0;

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <AlertTriangle className="size-4 text-amber-600" />
          Listing Freshness
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                FRESHNESS_STATE_COLORS[FRESHNESS_STATE.FRESH],
              )}
            >
              Fresh
            </span>
            <span className="font-semibold text-slate-900">
              {freshCount.toLocaleString("en-IN")}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                FRESHNESS_STATE_COLORS[FRESHNESS_STATE.AGING],
              )}
            >
              Aging
            </span>
            <span className="font-semibold text-slate-900">
              {agingCount.toLocaleString("en-IN")}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                FRESHNESS_STATE_COLORS[FRESHNESS_STATE.STALE],
              )}
            >
              Stale
            </span>
            <span className="font-semibold text-slate-900">
              {staleCount.toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        <Link
          href="/admin/stale-listings"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          Review stale listing queue
          <ArrowRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
