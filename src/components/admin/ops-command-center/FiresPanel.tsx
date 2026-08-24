"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const VISIBLE_LIMIT = 15;

const SEVERITY_BADGE_STYLES = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-yellow-100 text-yellow-800",
} as const;

const CATEGORY_LABELS = {
  warning: "Warning",
  stale_negotiation: "Stale Negotiation",
  overdue_checkin: "Overdue Check-in",
  low_quality: "Low Quality",
} as const;

export function FiresPanel() {
  const fires = useQuery(api.opsManagement.getFiresAlert);
  const [showAll, setShowAll] = useState(false);

  if (fires === undefined) {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Fires to Fight</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {["fire-skeleton-1", "fire-skeleton-2", "fire-skeleton-3"].map((key) => (
            <div key={key} className="rounded-lg border border-slate-200 p-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-2/3" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (fires.length === 0) {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Fires to Fight</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">All clear - no active fires.</CardContent>
      </Card>
    );
  }

  const visibleFires = showAll ? fires : fires.slice(0, VISIBLE_LIMIT);
  const hiddenCount = Math.max(0, fires.length - VISIBLE_LIMIT);

  return (
    <Card className="rounded-xl border border-slate-200 bg-white">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base text-slate-900">Fires to Fight</CardTitle>
        <p className="text-xs text-slate-500">Prioritized by severity, then recency.</p>
      </CardHeader>

      <CardContent className="space-y-3">
        <Accordion type="multiple" className="space-y-2">
          {visibleFires.map((fire) => (
            <AccordionItem
              key={fire.id}
              value={fire.id}
              className="rounded-lg border border-slate-200 px-3 last:border-b"
            >
              <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <AccordionTrigger className="py-0 text-left hover:no-underline">
                    <div className="space-y-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={SEVERITY_BADGE_STYLES[fire.severity]}>
                          {fire.severity}
                        </Badge>
                        <Badge variant="outline" className="border-slate-300 text-slate-700">
                          {CATEGORY_LABELS[fire.category]}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{fire.description}</p>
                      <p className="text-xs text-slate-500">Agent: {fire.agent_name}</p>
                    </div>
                  </AccordionTrigger>
                </div>

                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link href={fire.action_href}>{fire.action_label}</Link>
                </Button>
              </div>

              <AccordionContent>
                <div className="space-y-2 rounded-md bg-slate-50 p-2">
                  {fire.entity_details.map((detail) => (
                    <div
                      key={`${fire.id}-${detail.entity_id}`}
                      className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-900">
                          {detail.display_label}
                        </p>
                        <p className="text-[11px] text-slate-600">{detail.current_blocker}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-slate-300 text-slate-700">
                          {detail.days_stuck}d
                        </Badge>
                        <Button asChild size="xs" variant="ghost">
                          <Link href={detail.action_href}>Open</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {!showAll && hiddenCount > 0 ? (
          <Button type="button" variant="outline" onClick={() => setShowAll(true)}>
            Show more ({hiddenCount})
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
