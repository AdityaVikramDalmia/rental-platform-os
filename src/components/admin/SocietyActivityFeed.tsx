"use client";

import { useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { Calendar, CheckCircle, FileText, XCircle, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { LEAD_STATUS, VISIT_STATUS } from "../../../lib/constants";
import { formatDate } from "../../../lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SocietyActivityFeedProps = {
  societyId: Id<"societies">;
};

type ActivityEvent = {
  id: string;
  createdAt: number;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
};

export function SocietyActivityFeed({ societyId }: SocietyActivityFeedProps) {
  const [oneWeekAgo] = useState(() => Date.now() - 7 * 24 * 60 * 60 * 1000);

  const leads = useQuery(api.leads.list, {
    society_id: societyId,
    paginationOpts: {
      numItems: 20,
      cursor: null,
    },
  });

  const visits = useQuery(api.visits.list, {
    society_id: societyId,
    date_from: oneWeekAgo,
    paginationOpts: {
      numItems: 50,
      cursor: null,
    },
  });

  const events = useMemo(() => {
    if (!leads || !visits) {
      return [] as ActivityEvent[];
    }

    const mergedEvents: ActivityEvent[] = [];

    for (const lead of leads.page) {
      if (lead._creationTime < oneWeekAgo) {
        continue;
      }

      const leadLocation = `${lead.building_name ?? "Building"} ${lead.flat_number}`;

      mergedEvents.push({
        id: `lead-created-${lead._id}`,
        createdAt: lead._creationTime,
        icon: FileText,
        iconClassName: "text-slate-500",
        description: `New lead submitted - ${leadLocation} by ${lead.guard_name ?? "Guard"}`,
      });

      if (lead.status === LEAD_STATUS.VERIFIED) {
        mergedEvents.push({
          id: `lead-verified-${lead._id}`,
          createdAt: lead._creationTime,
          icon: CheckCircle,
          iconClassName: "text-green-600",
          description: `Lead verified - ${leadLocation}`,
        });
      }

      if (lead.status === LEAD_STATUS.REJECTED) {
        mergedEvents.push({
          id: `lead-rejected-${lead._id}`,
          createdAt: lead._creationTime,
          icon: XCircle,
          iconClassName: "text-red-600",
          description: `Lead rejected - ${leadLocation}`,
        });
      }
    }

    for (const visit of visits.page) {
      if (visit._creationTime < oneWeekAgo) {
        continue;
      }

      const buildingName = visit.building?.name ?? "Building";
      const flatNumber = visit.lead?.flat_number ?? "Flat";
      const visitLocation = `${buildingName} ${flatNumber}`;

      mergedEvents.push({
        id: `visit-created-${visit._id}`,
        createdAt: visit._creationTime,
        icon: Calendar,
        iconClassName: "text-blue-600",
        description: `Visit scheduled - ${visitLocation} on ${formatDate(visit.scheduled_start)}`,
      });

      if (visit.status === VISIT_STATUS.COMPLETED) {
        mergedEvents.push({
          id: `visit-completed-${visit._id}`,
          createdAt: visit._creationTime,
          icon: Calendar,
          iconClassName: "text-green-600",
          description: `Visit completed - ${visitLocation}`,
        });
      }
    }

    return mergedEvents.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
  }, [leads, oneWeekAgo, visits]);

  const isLoading = leads === undefined || visits === undefined;

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`activity-skeleton-${index}`} className="flex items-center gap-3">
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="py-6 text-sm text-slate-600">No activity in the last 7 days.</p>
        ) : (
          <div className="max-h-[360px] overflow-y-auto pr-1">
            <div className="space-y-3 border-l border-slate-200 pl-4">
              {events.map((event) => {
                const Icon = event.icon;

                return (
                  <div key={event.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <Icon className={`size-4 shrink-0 ${event.iconClassName}`} />
                    <p className="truncate">{event.description}</p>
                    <span className="ml-auto shrink-0 text-xs text-slate-500">
                      {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
