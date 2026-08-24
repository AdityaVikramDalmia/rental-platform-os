"use client";

import { Fragment, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { ChevronDown, ChevronUp, Loader2, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ActorBadge } from "./actor-badge";
import { ActionDisplay } from "./action-display";
import { EntityLink } from "./entity-link";
import { AuditChangeDiff } from "./audit-change-diff";

type AuditEntry = {
  _id: string;
  _creationTime: number;
  actor_user_id?: string;
  actor_type: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  changes?: Array<{ field: string; old_value: unknown; new_value: unknown }>;
  metadata?: unknown;
};

type AuditTableProps = {
  entries: AuditEntry[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  onLoadMore: () => void;
};

function hasExpandableContent(entry: AuditEntry): boolean {
  if (entry.changes && entry.changes.length > 0) return true;
  if (entry.action.endsWith("_INSERT") || entry.action.endsWith("_DELETE")) return true;
  return false;
}

export function AuditTable({ entries, status, onLoadMore }: AuditTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isLoading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const isLoadingMore = status === "LoadingMore";

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="pt-6">
        {!isLoading && entries.length > 0 && (
          <p className="mb-3 text-xs text-slate-500">Showing {entries.length} entries</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-2.5 font-medium">Time</th>
                <th className="px-3 py-2.5 font-medium">Actor</th>
                <th className="px-3 py-2.5 font-medium">Action</th>
                <th className="px-3 py-2.5 font-medium">Entity</th>
                <th className="px-3 py-2.5 font-medium">Changes</th>
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`skeleton-${index}`} className="border-b border-slate-100">
                      {Array.from({ length: 5 }).map((__, colIdx) => (
                        <td key={`skeleton-${index}-${colIdx}`} className="px-3 py-3">
                          <Skeleton className="h-4 w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                : entries.map((entry, index) => {
                    const isExpanded = expandedId === entry._id;
                    const expandable = hasExpandableContent(entry);

                    return (
                      <Fragment key={entry._id}>
                        <tr
                          className={cn(
                            "border-b border-slate-100 text-slate-800",
                            index % 2 === 0 && "bg-muted/30",
                          )}
                        >
                          <td className="px-3 py-3">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-default text-sm text-slate-600">
                                    {formatDistanceToNow(new Date(entry._creationTime), {
                                      addSuffix: true,
                                    })}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {format(new Date(entry._creationTime), "PPpp")}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </td>
                          <td className="px-3 py-3">
                            <ActorBadge name={entry.actor_name} actorType={entry.actor_type} />
                          </td>
                          <td className="px-3 py-3">
                            <ActionDisplay action={entry.action} />
                          </td>
                          <td className="px-3 py-3">
                            <EntityLink entityType={entry.entity_type} entityId={entry.entity_id} />
                          </td>
                          <td className="px-3 py-3">
                            {expandable ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpandedId(isExpanded ? null : entry._id)}
                                className="h-7 gap-1 text-xs text-slate-500"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="size-3.5" />
                                ) : (
                                  <ChevronDown className="size-3.5" />
                                )}
                                {isExpanded ? "Hide" : "View"}
                              </Button>
                            ) : (
                              <span className="text-sm text-slate-400">&mdash;</span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-slate-100">
                            <td colSpan={5} className="px-3 py-3">
                              <AuditChangeDiff
                                action={entry.action}
                                changes={entry.changes}
                                metadata={entry.metadata}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!isLoading && entries.length === 0 && (
          <div className="py-12 text-center">
            <ScrollText className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">
              No audit entries found matching your filters.
            </p>
          </div>
        )}

        {(canLoadMore || isLoadingMore) && (
          <div className="flex justify-center pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="border-slate-300 text-slate-700"
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
  );
}
