"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { CalendarClock, Loader2 } from "lucide-react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { VISIT_STATUS, type VisitStatus } from "../../../../../lib/constants";
import { formatDateTime } from "../../../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { VisitStatusBadge } from "@/components/shared/visit-status-badge";
import { cn } from "@/lib/utils";

type VisitWithContext = {
  visit_id: Id<"visits">;
  inquiry_id: Id<"tenant_inquiries"> | null;
  status: VisitStatus;
  scheduled_start: number;
  scheduled_end: number;
  listing?: {
    id: Id<"listings">;
    title: string;
    slug: string;
    bhk_config: string;
    rent_monthly: number;
    building_name: string | null;
    society_name: string | null;
  } | null;
  guard?: {
    id: Id<"users">;
    first_name: string;
  } | null;
};

type VisitsTab = "upcoming" | "past";

const TERMINAL_STATUSES = new Set<VisitStatus>([
  VISIT_STATUS.COMPLETED,
  VISIT_STATUS.CANCELLED,
  VISIT_STATUS.NO_SHOW,
]);

function formatListingLabel(visit: VisitWithContext): string {
  if (visit.listing?.title) {
    return visit.listing.title;
  }

  if (visit.listing?.slug) {
    return visit.listing.slug
      .split("-")
      .map((segment) => (segment.length > 0 ? segment[0].toUpperCase() + segment.slice(1) : ""))
      .filter((segment) => segment.length > 0)
      .join(" ");
  }

  return visit.listing?.society_name ?? "Visit";
}

export default function TenantVisitsPage() {
  const [activeTab, setActiveTab] = useState<VisitsTab>("upcoming");
  const [now] = useState(() => Date.now());
  const visitsResult = useQuery(api.visits.getMyVisits, {});

  const [upcomingVisits, pastVisits] = useMemo(() => {
    const rows = (visitsResult?.page ?? []) as VisitWithContext[];

    const upcoming = rows
      .filter((visit) => !TERMINAL_STATUSES.has(visit.status) && visit.scheduled_start >= now)
      .sort((a, b) => a.scheduled_start - b.scheduled_start);

    const past = rows
      .filter((visit) => TERMINAL_STATUSES.has(visit.status) || visit.scheduled_start < now)
      .sort((a, b) => b.scheduled_start - a.scheduled_start);

    return [upcoming, past];
  }, [visitsResult, now]);

  const visibleVisits = activeTab === "upcoming" ? upcomingVisits : pastVisits;

  if (visitsResult === undefined) {
    return (
      <div className="space-y-4 pb-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={`visit-skeleton-${String(index)}`} className="border-slate-200">
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Visits</h1>
        <p className="text-sm text-slate-600">Track upcoming walkthroughs and completed visits.</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-10 flex-1 rounded-lg",
            activeTab === "upcoming" && "bg-cyan-600 text-white hover:bg-cyan-700 hover:text-white",
          )}
          onClick={() => setActiveTab("upcoming")}
        >
          Upcoming ({upcomingVisits.length})
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-10 flex-1 rounded-lg",
            activeTab === "past" && "bg-cyan-600 text-white hover:bg-cyan-700 hover:text-white",
          )}
          onClick={() => setActiveTab("past")}
        >
          Past ({pastVisits.length})
        </Button>
      </div>

      {visibleVisits.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="space-y-3 py-10 text-center">
            <div className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
              <CalendarClock className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-slate-900">
                {activeTab === "upcoming" ? "No upcoming visits" : "No past visits yet"}
              </p>
              <p className="text-sm text-slate-600">
                {activeTab === "upcoming"
                  ? "Visits will appear here after your inquiry is scheduled."
                  : "Completed, cancelled, and no-show visits will appear here."}
              </p>
            </div>
            <Button asChild className="bg-cyan-600 text-white hover:bg-cyan-700">
              <Link href="/tenant/inquiries">Go to inquiries</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleVisits.map((visit) => (
            <Card key={String(visit.visit_id)} className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="space-y-3 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base text-slate-900">
                    {formatListingLabel(visit)}
                  </CardTitle>
                  <VisitStatusBadge status={visit.status} />
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                  <Badge variant="outline">{formatDateTime(visit.scheduled_start)}</Badge>
                  <Badge variant="outline">to {formatDateTime(visit.scheduled_end)}</Badge>
                  {visit.guard?.first_name ? (
                    <Badge variant="outline">Guard: {visit.guard.first_name}</Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="flex flex-wrap gap-2">
                  {visit.listing?.slug ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/listing/${visit.listing.slug}`}>View listing</Link>
                    </Button>
                  ) : null}
                  {visit.inquiry_id ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/tenant/inquiries/${visit.inquiry_id}`}>View inquiry</Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {visitsResult.page.length === 0 ? (
        <div className="flex items-center justify-center text-xs text-slate-500">
          <Loader2 className="mr-1.5 size-3.5" />
          Visit timeline starts once your first inquiry is scheduled.
        </div>
      ) : null}
    </div>
  );
}
