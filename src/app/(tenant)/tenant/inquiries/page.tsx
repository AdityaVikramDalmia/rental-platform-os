"use client";

import { usePaginatedQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "../../../../../convex/_generated/api";
import { TENANT_INQUIRY_STATUS, TENANT_INQUIRY_STATUS_LABELS } from "../../../../../lib/constants";
import { InquiryListItem } from "@/components/tenant/inquiries/inquiry-list-item";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  TENANT_INQUIRY_STATUS.SUBMITTED,
  TENANT_INQUIRY_STATUS.REVIEWED,
  TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
  TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
  TENANT_INQUIRY_STATUS.VISIT_SCHEDULED,
  TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
  TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
  TENANT_INQUIRY_STATUS.CLOSED,
  TENANT_INQUIRY_STATUS.REJECTED,
  TENANT_INQUIRY_STATUS.EXPIRED,
] as const;

export default function TenantInquiriesPage() {
  const [activeStatus, setActiveStatus] = useState<(typeof STATUS_FILTERS)[number] | null>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.tenantInquiries.getMyInquiries,
    {
      status: activeStatus ?? undefined,
    },
    { initialNumItems: 20 },
  );

  const heading = useMemo(() => {
    if (!activeStatus) return "All inquiries";
    return TENANT_INQUIRY_STATUS_LABELS[activeStatus];
  }, [activeStatus]);

  return (
    <div className="space-y-5 pb-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Inquiries</h1>
        <p className="text-sm text-slate-600">Track every inquiry from submission to closure.</p>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex min-w-max items-center gap-2 pb-1">
          <Button
            type="button"
            size="sm"
            variant={activeStatus === null ? "default" : "outline"}
            className={cn(activeStatus === null ? "bg-cyan-600 text-white hover:bg-cyan-700" : "")}
            onClick={() => setActiveStatus(null)}
          >
            All
          </Button>
          {STATUS_FILTERS.map((statusOption) => (
            <Button
              key={statusOption}
              type="button"
              size="sm"
              variant={activeStatus === statusOption ? "default" : "outline"}
              className={cn(
                activeStatus === statusOption ? "bg-cyan-600 text-white hover:bg-cyan-700" : "",
              )}
              onClick={() => setActiveStatus(statusOption)}
            >
              {TENANT_INQUIRY_STATUS_LABELS[statusOption]}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-700">
          {heading} ({results.length})
        </p>

        {status === "LoadingFirstPage" ? (
          <div className="space-y-3">
            {["a", "b", "c", "d", "e"].map((skeletonKey) => (
              <Card key={`inquiry-skeleton-${skeletonKey}`} className="border-slate-200">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <Skeleton className="h-14 w-14 rounded-lg" />
                    <div className="w-full space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        {status !== "LoadingFirstPage" && results.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="space-y-3 py-10 text-center">
              <p className="text-base font-semibold text-slate-800">No inquiries found</p>
              <p className="text-sm text-slate-600">
                Submit a visit request from a listing to start tracking your inquiry lifecycle.
              </p>
              <Button asChild className="bg-cyan-600 text-white hover:bg-cyan-700">
                <Link href="/listings">Browse listings</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {status !== "LoadingFirstPage" && results.length > 0 ? (
          <div className="space-y-3">
            {results.map((inquiry) => (
              <InquiryListItem key={String(inquiry.inquiry_id)} inquiry={inquiry} />
            ))}
          </div>
        ) : null}

        {status === "LoadingMore" ? (
          <div className="flex items-center justify-center py-4 text-sm text-slate-500">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading more inquiries...
          </div>
        ) : null}

        {status === "CanLoadMore" ? (
          <div className="flex justify-center pt-2">
            <Button type="button" variant="outline" onClick={() => loadMore(20)}>
              Load More
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
