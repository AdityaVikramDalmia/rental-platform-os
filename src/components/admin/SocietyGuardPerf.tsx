"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { GUARD_TYPE } from "../../../lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SocietyGuardPerfProps = {
  societyId: Id<"societies">;
};

const GUARD_TYPE_LABELS: Record<string, string> = {
  [GUARD_TYPE.BUILDING_SPECIFIC]: "Building",
  [GUARD_TYPE.MAIN_GATE]: "Main Gate",
  [GUARD_TYPE.PARK]: "Park",
  [GUARD_TYPE.ROVING]: "Roving",
};

function getVerifiedRateClass(rate: number | null): string {
  if (rate === null) {
    return "text-slate-500";
  }

  if (rate >= 70) {
    return "text-green-700";
  }

  if (rate >= 40) {
    return "text-amber-700";
  }

  return "text-red-700";
}

export function SocietyGuardPerf({ societyId }: SocietyGuardPerfProps) {
  const guards = useQuery(api.guards.list, { society_id: societyId });
  const visits = useQuery(api.visits.list, {
    society_id: societyId,
    paginationOpts: {
      numItems: 2000,
      cursor: null,
    },
  });

  const leaderboard = useMemo(() => {
    if (!guards) {
      return [] as Array<{
        userId: Id<"users">;
        name: string;
        guardType: string;
        leadsSubmitted: number;
        verifiedCount: number;
        visitCount: number;
        verifiedRate: number | null;
      }>;
    }

    const visitCountsByGuard = new Map<Id<"users">, number>();

    for (const visit of visits?.page ?? []) {
      const currentCount = visitCountsByGuard.get(visit.assigned_guard_id) ?? 0;
      visitCountsByGuard.set(visit.assigned_guard_id, currentCount + 1);
    }

    return guards
      .map((guard) => {
        const leadsSubmitted = guard.lead_count ?? 0;
        const verifiedCount =
          leadsSubmitted === 0 ? 0 : Math.round((guard.verified_rate / 100) * leadsSubmitted);

        return {
          userId: guard.user_id,
          name: guard.name,
          guardType: guard.guard_type,
          leadsSubmitted,
          verifiedCount,
          visitCount: visitCountsByGuard.get(guard.user_id) ?? 0,
          verifiedRate: leadsSubmitted === 0 ? null : guard.verified_rate,
        };
      })
      .sort((a, b) => {
        if (b.verifiedCount !== a.verifiedCount) {
          return b.verifiedCount - a.verifiedCount;
        }

        return a.name.localeCompare(b.name);
      })
      .slice(0, 5);
  }, [guards, visits]);

  const isLoading = guards === undefined || visits === undefined;

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">Guard Performance</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[660px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Guard</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 text-right font-medium">Submitted</th>
                  <th className="px-3 py-2.5 text-right font-medium">Verified</th>
                  <th className="px-3 py-2.5 text-right font-medium">Visits</th>
                  <th className="py-2.5 pl-3 pr-0 text-right font-medium">Verified Rate</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 3 }).map((_, index) => (
                  <tr key={`guard-perf-skeleton-${index}`} className="border-b border-slate-100">
                    {Array.from({ length: 6 }).map((__, col) => (
                      <td
                        key={`guard-perf-skeleton-${index}-${col}`}
                        className="px-3 py-3 first:pl-0"
                      >
                        <Skeleton className="h-4 w-20" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : leaderboard.length === 0 ? (
          <p className="py-6 text-sm text-slate-600">No guards assigned to this society.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[660px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Guard</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 text-right font-medium">Submitted</th>
                  <th className="px-3 py-2.5 text-right font-medium">Verified</th>
                  <th className="px-3 py-2.5 text-right font-medium">Visits</th>
                  <th className="py-2.5 pl-3 pr-0 text-right font-medium">Verified Rate</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((guard) => (
                  <tr key={guard.userId} className="border-b border-slate-100 text-slate-800">
                    <td className="py-3 pr-3 font-medium text-slate-900">{guard.name}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {GUARD_TYPE_LABELS[guard.guardType] ?? guard.guardType}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{guard.leadsSubmitted}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{guard.verifiedCount}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{guard.visitCount}</td>
                    <td className="py-3 pl-3 pr-0 text-right tabular-nums">
                      <span className={getVerifiedRateClass(guard.verifiedRate)}>
                        {guard.verifiedRate === null ? "-" : `${Math.round(guard.verifiedRate)}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
