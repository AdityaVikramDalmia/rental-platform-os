"use client";

import { useQuery } from "convex/react";
import { Clock, FileCheck, History } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  DEAL_CHECKLIST_STATUS_COLORS,
  DEAL_CHECKLIST_STATUS_LABELS,
  type DealChecklistStatus,
} from "../../../lib/constants";
import { formatDateTime, formatRelativeTime } from "../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VersionHistoryProps = {
  inquiryId: Id<"tenant_inquiries">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentVersionId?: Id<"deal_checklists">;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VersionHistory({
  inquiryId,
  open,
  onOpenChange,
  currentVersionId,
}: VersionHistoryProps) {
  const versions = useQuery(
    api.dealChecklists.listVersions,
    open ? { inquiry_id: inquiryId } : "skip",
  );

  const isLoading = versions === undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="size-5 text-indigo-600" />
            Version History
          </SheetTitle>
          <SheetDescription>All versions of the deal checklist for this inquiry.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-1">
          {isLoading && (
            <div className="space-y-4">
              {["skel-v-a", "skel-v-b", "skel-v-c"].map((key) => (
                <div key={key} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && versions.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="rounded-full bg-slate-100 p-4">
                <FileCheck className="size-8 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500">No versions found</p>
            </div>
          )}

          {!isLoading &&
            versions.map((version, index) => {
              const isCurrent = version._id === currentVersionId;
              const status = version.status as DealChecklistStatus;
              const statusColor =
                DEAL_CHECKLIST_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600";
              const statusLabel = DEAL_CHECKLIST_STATUS_LABELS[status] ?? status;
              const isSuperseded = status === "SUPERSEDED";

              return (
                <div key={version._id}>
                  <div
                    className={cn(
                      "relative rounded-lg border p-4 transition-colors",
                      isCurrent
                        ? "border-indigo-300 bg-indigo-50/50"
                        : isSuperseded
                          ? "border-slate-200 bg-slate-50/50"
                          : "border-slate-200 bg-white",
                    )}
                  >
                    {/* Timeline connector */}
                    {index < versions.length - 1 && (
                      <div className="absolute left-[26px] top-[52px] h-[calc(100%-36px)] w-px bg-slate-200" />
                    )}

                    <div className="flex items-start gap-3">
                      {/* Version number circle */}
                      <div
                        className={cn(
                          "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                          isCurrent
                            ? "bg-indigo-600 text-white"
                            : isSuperseded
                              ? "bg-slate-200 text-slate-500"
                              : "bg-slate-100 text-slate-700",
                        )}
                      >
                        v{version.version}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-sm font-semibold",
                              isSuperseded ? "text-slate-400" : "text-slate-900",
                            )}
                          >
                            Version {version.version}
                          </span>
                          {isCurrent && (
                            <Badge
                              variant="outline"
                              className="border-indigo-300 bg-indigo-100 text-[10px] font-bold text-indigo-700"
                            >
                              Current
                            </Badge>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] font-semibold",
                              statusColor,
                              isSuperseded && "opacity-60",
                            )}
                          >
                            {statusLabel}
                          </Badge>
                          <span
                            className={cn(
                              "text-[11px]",
                              isSuperseded ? "text-slate-400" : "text-slate-500",
                            )}
                          >
                            {version.items.length} items
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                          <Clock className="size-3" />
                          <span>Created {formatDateTime(version.created_at)}</span>
                        </div>

                        {version.shared_at && (
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            Shared {formatRelativeTime(version.shared_at)}
                          </div>
                        )}

                        {version.approved_at && (
                          <div className="mt-0.5 text-[11px] text-emerald-600">
                            Approved {formatRelativeTime(version.approved_at)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {index < versions.length - 1 && <Separator className="my-1 opacity-0" />}
                </div>
              );
            })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
