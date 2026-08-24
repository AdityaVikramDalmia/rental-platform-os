"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CheckInHistoryProps = {
  agentId: Id<"users">;
};

const SENTIMENT_STYLE: Record<"POSITIVE" | "NEUTRAL" | "NEEDS_IMPROVEMENT", string> = {
  POSITIVE: "bg-emerald-100 text-emerald-700",
  NEUTRAL: "bg-slate-100 text-slate-700",
  NEEDS_IMPROVEMENT: "bg-amber-100 text-amber-700",
};

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

export function CheckInHistory({ agentId }: CheckInHistoryProps) {
  const [limit, setLimit] = useState(10);
  const [toggleInFlightKey, setToggleInFlightKey] = useState<string | null>(null);
  const checkIns = useQuery(api.opsManagement.listCheckInsForAgent, {
    agent_user_id: agentId,
    limit,
  });
  const toggleActionItem = useMutation(api.opsManagement.toggleActionItem);

  const hasMore = useMemo(() => {
    if (!checkIns) {
      return false;
    }

    return checkIns.length >= limit;
  }, [checkIns, limit]);

  async function handleToggle(checkInId: Id<"ops_check_in_notes">, itemIndex: number) {
    const actionKey = `${checkInId}-${itemIndex}`;
    setToggleInFlightKey(actionKey);

    try {
      await toggleActionItem({
        check_in_id: checkInId,
        item_index: itemIndex,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update action item";
      toast.error(message);
    } finally {
      setToggleInFlightKey(null);
    }
  }

  if (checkIns === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_value, index) => (
          <div
            key={`checkin-history-skeleton-${index + 1}`}
            className="rounded-lg border border-slate-200 p-3"
          >
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-5/6" />
          </div>
        ))}
      </div>
    );
  }

  if (checkIns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        No check-ins recorded
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="space-y-3">
      <Accordion type="multiple" className="rounded-lg border border-slate-200 bg-white px-3">
        {checkIns.map((checkIn) => (
          <AccordionItem key={checkIn._id} value={checkIn._id}>
            <AccordionTrigger className="hover:no-underline">
              <div className="w-full space-y-2 text-left">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">
                    {formatDateTime(checkIn.created_at)}
                    <span className="ml-2 text-xs font-normal text-slate-600">
                      by {checkIn.reviewer?.name ?? "Unknown reviewer"}
                    </span>
                  </p>
                  {checkIn.sentiment ? (
                    <Badge className={SENTIMENT_STYLE[checkIn.sentiment]}>
                      {checkIn.sentiment}
                    </Badge>
                  ) : null}
                </div>
                <p className="line-clamp-2 pr-6 text-xs text-slate-600">{checkIn.notes}</p>
              </div>
            </AccordionTrigger>

            <AccordionContent className="space-y-3 pb-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{checkIn.notes}</p>
              </div>

              {checkIn.action_items.length === 0 ? (
                <p className="text-xs text-slate-500">No action items recorded.</p>
              ) : (
                <div className="space-y-2">
                  {checkIn.action_items.map((item, index) => {
                    const isOverdue =
                      item.due_date !== undefined &&
                      item.completed === false &&
                      item.due_date < now;
                    const actionKey = `${checkIn._id}-${index}`;
                    const isToggling = toggleInFlightKey === actionKey;

                    return (
                      <div
                        key={actionKey}
                        className={cn(
                          "rounded-md border px-3 py-2",
                          isOverdue ? "border-red-200 bg-red-50" : "border-slate-200 bg-white",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={item.completed}
                            disabled={isToggling}
                            onCheckedChange={() => handleToggle(checkIn._id, index)}
                          />
                          <div className="space-y-1">
                            <p
                              className={cn(
                                "text-sm",
                                item.completed ? "text-slate-500 line-through" : "text-slate-800",
                              )}
                            >
                              {item.description}
                            </p>
                            {item.due_date !== undefined ? (
                              <p
                                className={cn(
                                  "text-xs",
                                  isOverdue ? "font-medium text-red-700" : "text-slate-500",
                                )}
                              >
                                Due: {formatDate(item.due_date)}
                                {isOverdue ? " (Overdue)" : ""}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {hasMore ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLimit((prev) => prev + 10)}
          >
            Load More
          </Button>
        </div>
      ) : null}
    </div>
  );
}
