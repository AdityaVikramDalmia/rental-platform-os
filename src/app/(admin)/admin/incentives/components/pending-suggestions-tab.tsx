"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../../convex/_generated/dataModel";
import { IncentiveCardBadge } from "@/components/shared/incentive-card-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type PaginationStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

type PendingSuggestionRow = Doc<"incentive_cards"> & {
  guard_name: string;
};

type PendingSuggestionsTabProps = {
  canAward: boolean;
};

type MetricSnapshot = {
  metric_name: unknown;
  metric_value: unknown;
};

function toMetadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function formatMetricValue(card: PendingSuggestionRow): string {
  const metadata = toMetadataRecord(card.metadata);
  const metricSnapshotRaw = metadata ? metadata.metric_snapshot : undefined;
  const metricSnapshot = toMetadataRecord(metricSnapshotRaw) as MetricSnapshot | null;

  if (!metricSnapshot) {
    return "--";
  }

  const metricName = metricSnapshot.metric_name;
  const metricValue = metricSnapshot.metric_value;

  if (metricName === "verified_leads_count" && typeof metricValue === "number") {
    return `${metricValue} verified leads`;
  }

  if (metricName === "completed_visits_count" && typeof metricValue === "number") {
    return `${metricValue} visits completed`;
  }

  if (metricName === "verified_rate" && typeof metricValue === "number") {
    return `${metricValue}% verification rate`;
  }

  if (typeof metricValue === "number") {
    return String(metricValue);
  }

  return "--";
}

export function PendingSuggestionsTab({ canAward }: PendingSuggestionsTabProps) {
  const confirmSuggestion = useMutation(api.incentives.confirm);
  const rejectSuggestion = useMutation(api.incentives.reject);
  const { results, status, loadMore } = usePaginatedQuery(
    api.incentives.listPending,
    {},
    {
      initialNumItems: 20,
    },
  );

  const rows = results as PendingSuggestionRow[];
  const [loadingCardId, setLoadingCardId] = useState<Id<"incentive_cards"> | null>(null);
  const [rejectingCard, setRejectingCard] = useState<PendingSuggestionRow | null>(null);

  const isLoading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const isLoadingMore = status === "LoadingMore";

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => b._creationTime - a._creationTime),
    [rows],
  );

  const handleConfirm = useCallback(
    async (cardId: Id<"incentive_cards">) => {
      setLoadingCardId(cardId);
      try {
        await confirmSuggestion({ card_id: cardId });
        toast.success("Card confirmed!");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to confirm card");
      } finally {
        setLoadingCardId(null);
      }
    },
    [confirmSuggestion],
  );

  const handleReject = useCallback(async () => {
    if (!rejectingCard) {
      return;
    }

    setLoadingCardId(rejectingCard._id);
    try {
      await rejectSuggestion({ card_id: rejectingCard._id });
      toast.success("Suggestion rejected");
      setRejectingCard(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject suggestion");
    } finally {
      setLoadingCardId(null);
    }
  }, [rejectSuggestion, rejectingCard]);

  return (
    <>
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Guard</th>
                  <th className="px-3 py-2.5 font-medium">Card Type</th>
                  <th className="px-3 py-2.5 font-medium">Suggested Tier</th>
                  <th className="px-3 py-2.5 font-medium">Metric Value</th>
                  <th className="px-3 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>

              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, index) => (
                      <tr
                        key={`pending-suggestions-skeleton-${index}`}
                        className="border-b border-slate-100"
                      >
                        {Array.from({ length: 5 }).map((__, colIdx) => (
                          <td
                            key={`pending-suggestions-skeleton-${index}-${colIdx}`}
                            className="px-3 py-3"
                          >
                            <Skeleton className="h-4 w-24" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : sortedRows.map((row) => {
                      const isRowLoading = loadingCardId === row._id;

                      return (
                        <tr key={row._id} className="border-b border-slate-100 text-slate-800">
                          <td className="px-3 py-3 text-slate-700">{row.guard_name}</td>
                          <td className="px-3 py-3">
                            <IncentiveCardBadge
                              cardType={row.card_type}
                              level={row.level}
                              status={row.status}
                            />
                          </td>
                          <td className="px-3 py-3 text-slate-700">{row.level}</td>
                          <td className="px-3 py-3 text-slate-700">{formatMetricValue(row)}</td>
                          <td className="px-3 py-3">
                            {canAward ? (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void handleConfirm(row._id)}
                                  disabled={isRowLoading}
                                  className="h-8 bg-green-600 px-2.5 text-white hover:bg-green-700"
                                >
                                  {isRowLoading ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    "Confirm"
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setRejectingCard(row)}
                                  disabled={isRowLoading}
                                  className="h-8 border-red-200 px-2.5 text-red-700 hover:bg-red-50 hover:text-red-700"
                                >
                                  Reject
                                </Button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {!isLoading && sortedRows.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No pending suggestions</p>
              <p className="mt-1 text-sm text-slate-500">
                Auto-award suggestions will appear here for admin review.
              </p>
            </div>
          )}

          {(canLoadMore || isLoadingMore) && (
            <div className="flex justify-center pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => loadMore(20)}
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

      <Dialog
        open={Boolean(rejectingCard)}
        onOpenChange={(open) => (!open ? setRejectingCard(null) : null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject this suggestion?</DialogTitle>
            <DialogDescription>
              This suggestion will be rejected and removed from Pending Suggestions.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectingCard(null)}
              disabled={loadingCardId !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleReject()}
              disabled={!rejectingCard || loadingCardId !== null}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {loadingCardId !== null ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                "Reject"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
