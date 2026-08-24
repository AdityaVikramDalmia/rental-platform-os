"use client";

import Link from "next/link";
import type { Id } from "../../../../convex/_generated/dataModel";
import { formatDateTime } from "../../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type UpcomingVisit = {
  visit_id: Id<"visits">;
  listing_title: string;
  scheduled_date: number;
  status: string;
};

type TenantUpcomingVisitsCardProps = {
  visits?: UpcomingVisit[];
};

function formatStatusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function TenantUpcomingVisitsCard({ visits }: TenantUpcomingVisitsCardProps) {
  if (!visits) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">Upcoming Visits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {["one", "two", "three"].map((key) => (
            <div key={key} className="rounded-lg border border-slate-100 p-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/2" />
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
          <CardTitle className="text-base text-slate-900">Upcoming Visits</CardTitle>
          <Link
            href="/tenant/visits"
            className="text-xs font-medium text-cyan-700 hover:text-cyan-800"
          >
            View All
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {visits.length === 0 ? (
          <div className="space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4">
            <p className="text-sm text-slate-600">No upcoming visits yet.</p>
            <Button
              asChild
              variant="outline"
              className="h-11 min-h-11 min-w-11 border-cyan-200 text-cyan-700 hover:bg-cyan-50"
            >
              <Link href="/tenant/inquiries">Track inquiries</Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {visits.map((visit) => (
              <li key={String(visit.visit_id)}>
                <Link
                  href="/tenant/visits"
                  className="block rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-cyan-200 hover:bg-cyan-50/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium text-slate-900">
                      {visit.listing_title}
                    </p>
                    <Badge className="border-transparent bg-cyan-100 text-cyan-700">
                      {formatStatusLabel(visit.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {formatDateTime(visit.scheduled_date)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
