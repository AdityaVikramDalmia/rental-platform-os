"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { LEAD_STATUS } from "../../../lib/constants";
import { formatDate } from "../../../lib/dates";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SocietyLeadsTabProps = {
  societyId: Id<"societies">;
};

type LeadStatusCounts = {
  SUBMITTED: number;
  NEED_INFO: number;
  POTENTIAL_DUPLICATE: number;
  VERIFIED: number;
  REJECTED: number;
  DUPLICATE: number;
};

const STATUS_TABS = [
  { key: "ALL", label: "All", status: undefined },
  { key: LEAD_STATUS.SUBMITTED, label: "Submitted", status: LEAD_STATUS.SUBMITTED },
  { key: LEAD_STATUS.VERIFIED, label: "Verified", status: LEAD_STATUS.VERIFIED },
  { key: LEAD_STATUS.REJECTED, label: "Rejected", status: LEAD_STATUS.REJECTED },
  { key: LEAD_STATUS.DUPLICATE, label: "Duplicate", status: LEAD_STATUS.DUPLICATE },
  { key: LEAD_STATUS.NEED_INFO, label: "Need Info", status: LEAD_STATUS.NEED_INFO },
] as const;

type StatusTabKey = (typeof STATUS_TABS)[number]["key"];

function toLeadStatusCounts(
  counts: Record<string, number> | undefined,
): LeadStatusCounts | undefined {
  if (!counts) {
    return undefined;
  }

  return {
    SUBMITTED: counts.SUBMITTED ?? 0,
    NEED_INFO: counts.NEED_INFO ?? 0,
    POTENTIAL_DUPLICATE: counts.POTENTIAL_DUPLICATE ?? 0,
    VERIFIED: counts.VERIFIED ?? 0,
    REJECTED: counts.REJECTED ?? 0,
    DUPLICATE: counts.DUPLICATE ?? 0,
  };
}

function getTabCount(counts: LeadStatusCounts | undefined, key: StatusTabKey): number {
  if (!counts) {
    return 0;
  }

  if (key === "ALL") {
    return Object.values(counts).reduce((sum, value) => sum + value, 0);
  }

  return counts[key] ?? 0;
}

export function SocietyLeadsTab({ societyId }: SocietyLeadsTabProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StatusTabKey>("ALL");
  const [oneWeekAgo] = useState(() => Date.now() - 7 * 24 * 60 * 60 * 1000);

  const selectedStatus = STATUS_TABS.find((tab) => tab.key === activeTab)?.status;

  const rawStatusCounts = useQuery(api.leads.getStatusCounts, { society_id: societyId });
  const statusCounts = useMemo(() => toLeadStatusCounts(rawStatusCounts), [rawStatusCounts]);
  const weeklyLeads = useQuery(api.leads.list, {
    society_id: societyId,
    paginationOpts: {
      numItems: 2000,
      cursor: null,
    },
  });

  const { results, status, loadMore } = usePaginatedQuery(
    api.leads.list,
    {
      society_id: societyId,
      status: selectedStatus,
    },
    { initialNumItems: 20 },
  );

  const summaryStats = useMemo(() => {
    const total = getTabCount(statusCounts, "ALL");
    const verified = statusCounts?.VERIFIED ?? 0;
    const conversionRate = total === 0 ? 0 : Math.round((verified / total) * 100);
    const leadsThisWeek =
      weeklyLeads?.page.filter((lead) => lead._creationTime >= oneWeekAgo).length ?? 0;

    return {
      total,
      conversionRate,
      leadsThisWeek,
    };
  }, [statusCounts, weeklyLeads, oneWeekAgo]);

  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {statusCounts === undefined || weeklyLeads === undefined ? (
          Array.from({ length: 3 }).map((_, index) => (
            <Card
              key={`leads-summary-skeleton-${index}`}
              className="border-slate-200 bg-white shadow-sm"
            >
              <CardContent className="space-y-2 pt-6">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-14" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="space-y-1 pt-6">
                <p className="text-sm text-slate-500">Total Leads</p>
                <p className="text-2xl font-semibold text-slate-900">{summaryStats.total}</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="space-y-1 pt-6">
                <p className="text-sm text-slate-500">Conversion Rate</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {summaryStats.conversionRate}%
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="space-y-1 pt-6">
                <p className="text-sm text-slate-500">Leads This Week</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {summaryStats.leadsThisWeek}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const count = getTabCount(statusCounts, tab.key);

              return (
                <Button
                  key={tab.key}
                  type="button"
                  variant={isActive ? "default" : "outline"}
                  className={
                    isActive
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "border-slate-300 text-slate-700"
                  }
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                  <span
                    className={
                      isActive
                        ? "rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold"
                        : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
                    }
                  >
                    {count}
                  </span>
                </Button>
              );
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Flat</th>
                  <th className="px-3 py-2.5 font-medium">Building</th>
                  <th className="px-3 py-2.5 font-medium">Guard</th>
                  <th className="px-3 py-2.5 font-medium">Owner Name</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Date Submitted</th>
                  <th className="py-2.5 pl-3 pr-0 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, index) => (
                      <tr
                        key={`society-lead-skeleton-${index}`}
                        className="border-b border-slate-100"
                      >
                        {Array.from({ length: 7 }).map((__, col) => (
                          <td
                            key={`society-lead-skeleton-${index}-${col}`}
                            className="px-3 py-3 first:pl-0"
                          >
                            <Skeleton className="h-4 w-24" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : results.map((lead) => {
                      const leadHref = `/admin/leads?lead=${lead._id}`;

                      return (
                        <tr
                          key={lead._id}
                          onClick={() => router.push(leadHref)}
                          className="cursor-pointer border-b border-slate-100 text-slate-800 transition-colors hover:bg-slate-50"
                        >
                          <td className="py-3 pr-3">
                            <span className="text-slate-900">{lead.building_name ?? "-"}</span>
                            <span className="text-slate-400">{" / Fl"}</span>
                            <span className="text-slate-500">{lead.floor_number}</span>
                            <span className="text-slate-400">{" / "}</span>
                            <span className="font-medium text-slate-800">{lead.flat_number}</span>
                          </td>
                          <td className="px-3 py-3 text-slate-700">{lead.building_name ?? "-"}</td>
                          <td className="px-3 py-3 text-slate-700">{lead.guard_name ?? "-"}</td>
                          <td className="px-3 py-3 text-slate-700">
                            {lead.owner_name ?? "Unknown"}
                          </td>
                          <td className="px-3 py-3">
                            <LeadStatusBadge status={lead.status} />
                          </td>
                          <td className="px-3 py-3 text-slate-700">
                            {formatDate(lead._creationTime)}
                          </td>
                          <td className="py-3 pl-3 pr-0 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-slate-300 text-slate-700"
                              onClick={(event) => {
                                event.stopPropagation();
                                router.push(leadHref);
                              }}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {!isLoading && results.length === 0 && (
            <div className="py-10 text-center">
              <FileText className="mx-auto mb-3 size-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">No leads found for this society.</p>
            </div>
          )}

          {(canLoadMore || isLoadingMore) && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                className="border-slate-300 text-slate-700"
                disabled={isLoadingMore}
                onClick={() => loadMore(20)}
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
