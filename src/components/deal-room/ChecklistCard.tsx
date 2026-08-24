"use client";

import { useQuery } from "convex/react";
import { ClipboardCheck, ExternalLink } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  DEAL_CHECKLIST_STATUS_COLORS,
  DEAL_CHECKLIST_STATUS_LABELS,
  type DealChecklistStatus,
} from "../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChecklistCardProps = {
  checklistId: Id<"deal_checklists">;
  onViewChecklist?: (checklistId: Id<"deal_checklists">) => void;
  className?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChecklistCard({ checklistId, onViewChecklist, className }: ChecklistCardProps) {
  const checklist = useQuery(api.dealChecklists.getById, {
    checklist_id: checklistId,
  });

  if (checklist === undefined) {
    return (
      <Card className={cn("w-full max-w-sm", className)}>
        <CardContent className="p-3">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (checklist === null) {
    return null;
  }

  const status = checklist.status as DealChecklistStatus;
  const statusColor = DEAL_CHECKLIST_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600";
  const statusLabel = DEAL_CHECKLIST_STATUS_LABELS[status] ?? status;

  const totalItems = checklist.items.length;
  const agreedItems = checklist.items.filter(
    (item) => item.tenant_approval.status === "AGREED" && item.owner_approval.status === "AGREED",
  ).length;
  const progressPct = totalItems > 0 ? Math.round((agreedItems / totalItems) * 100) : 0;

  return (
    <Card
      className={cn(
        "w-full max-w-sm overflow-hidden border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white",
        className,
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
            <ClipboardCheck className="size-4 text-indigo-600" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">
                Deal Checklist v{checklist.version}
              </span>
              <Badge
                variant="secondary"
                className={cn("shrink-0 text-[10px] font-semibold", statusColor)}
              >
                {statusLabel}
              </Badge>
            </div>

            {/* Progress */}
            <div className="mt-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  {agreedItems}/{totalItems} items agreed
                </span>
                <span className="font-semibold text-slate-700">{progressPct}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* View Button */}
            {onViewChecklist && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onViewChecklist(checklistId)}
                className="mt-2 h-7 w-full justify-center gap-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700"
              >
                View Checklist
                <ExternalLink className="size-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
