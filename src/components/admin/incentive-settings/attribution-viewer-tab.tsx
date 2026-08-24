"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { ATTRIBUTION_STATUS } from "../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type StatusFilter = "ALL" | "FINAL" | "DISPUTED" | "RESOLVED";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "FINAL", label: "Final" },
  { value: "DISPUTED", label: "Disputed" },
  { value: "RESOLVED", label: "Resolved" },
];

const STATUS_BADGE_VARIANTS: Record<string, string> = {
  PROVISIONAL: "border-slate-300 bg-slate-50 text-slate-600",
  FINAL: "border-emerald-300 bg-emerald-50 text-emerald-700",
  DISPUTED: "border-amber-300 bg-amber-50 text-amber-700",
  RESOLVED: "border-blue-300 bg-blue-50 text-blue-700",
};

function formatINR(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type AttributionViewerTabProps = {
  canDispute: boolean;
  canOverride: boolean;
};

export function AttributionViewerTab({ canDispute, canOverride }: AttributionViewerTabProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  const thirtyDaysAgo = useMemo(() => Date.now() - 30 * 24 * 60 * 60 * 1000, []);

  const queryArgs = useMemo(() => {
    const base: {
      from_ts: number;
      status?: "FINAL" | "DISPUTED" | "RESOLVED" | "PROVISIONAL";
    } = { from_ts: thirtyDaysAgo };

    if (statusFilter !== "ALL") {
      base.status = statusFilter;
    }

    return base;
  }, [statusFilter, thirtyDaysAgo]);

  const {
    results,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(api.attribution.listByWindow, queryArgs, { initialNumItems: 20 });

  const [disputeTarget, setDisputeTarget] = useState<Id<"attribution_records"> | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [isDisputing, setIsDisputing] = useState(false);

  const [overrideTarget, setOverrideTarget] = useState<Id<"attribution_records"> | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSplits, setOverrideSplits] = useState<
    { recipient_user_id: string; amount_paise: string; notes: string }[]
  >([{ recipient_user_id: "", amount_paise: "", notes: "" }]);
  const [isOverriding, setIsOverriding] = useState(false);

  const disputeAttribution = useMutation(api.attribution.disputeAttribution);
  const overrideAttribution = useMutation(api.attribution.overrideAttribution);

  async function handleDispute() {
    if (!disputeTarget || !disputeReason.trim()) {
      toast.error("A reason is required to dispute an attribution.");
      return;
    }

    setIsDisputing(true);
    try {
      await disputeAttribution({
        attribution_record_id: disputeTarget,
        reason: disputeReason.trim(),
      });
      toast.success("Attribution disputed successfully.");
      setDisputeTarget(null);
      setDisputeReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to dispute attribution");
    } finally {
      setIsDisputing(false);
    }
  }

  async function handleOverride() {
    if (!overrideTarget || !overrideReason.trim()) {
      toast.error("A reason is required to override an attribution.");
      return;
    }

    const parsedSplits = overrideSplits
      .filter((s) => s.recipient_user_id.trim() && s.amount_paise.trim())
      .map((s) => ({
        recipient_user_id: s.recipient_user_id.trim() as Id<"users">,
        amount_paise: Math.round(Number(s.amount_paise) * 100),
        notes: s.notes.trim() || undefined,
      }));

    if (parsedSplits.length === 0) {
      toast.error("At least one split recipient is required.");
      return;
    }

    setIsOverriding(true);
    try {
      await overrideAttribution({
        attribution_record_id: overrideTarget,
        manual_splits: parsedSplits,
        reason: overrideReason.trim(),
      });
      toast.success("Attribution overridden successfully.");
      setOverrideTarget(null);
      setOverrideReason("");
      setOverrideSplits([{ recipient_user_id: "", amount_paise: "", notes: "" }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to override attribution");
    } finally {
      setIsOverriding(false);
    }
  }

  function addOverrideSplit() {
    setOverrideSplits((prev) => [...prev, { recipient_user_id: "", amount_paise: "", notes: "" }]);
  }

  function updateOverrideSplit(
    idx: number,
    field: "recipient_user_id" | "amount_paise" | "notes",
    value: string,
  ) {
    setOverrideSplits((prev) =>
      prev.map((split, i) => (i === idx ? { ...split, [field]: value } : split)),
    );
  }

  function removeOverrideSplit(idx: number) {
    setOverrideSplits((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function renderRecordRow(
    record: Doc<"attribution_records">,
    splits: Doc<"attribution_splits">[],
  ): ReactNode {
    const isExpanded = expandedRecordId === record._id;
    const badgeClass = STATUS_BADGE_VARIANTS[record.status] ?? STATUS_BADGE_VARIANTS.PROVISIONAL;

    return (
      <>
        <tr
          key={record._id}
          className="cursor-pointer transition-colors hover:bg-slate-50"
          onClick={() => setExpandedRecordId(isExpanded ? null : record._id)}
        >
          <td className="px-4 py-3">
            {isExpanded ? (
              <ChevronDown className="size-4 text-slate-400" />
            ) : (
              <ChevronRight className="size-4 text-slate-400" />
            )}
          </td>
          <td className="px-4 py-3 font-mono text-xs text-slate-600">
            {truncateId(record.closure_id)}
          </td>
          <td className="px-4 py-3">
            <Badge variant="outline" className={badgeClass}>
              {record.status}
            </Badge>
          </td>
          <td className="px-4 py-3 text-right font-medium tabular-nums">
            {formatINR(record.pool_amount_paise)}
          </td>
          <td className="px-4 py-3 text-xs text-slate-600">
            {record.algorithm.replace(/_/g, " ")}
          </td>
          <td className="px-4 py-3 text-xs text-slate-500">{formatDate(record.computed_at)}</td>
          <td className="px-4 py-3">
            <span className="inline-flex gap-1">
              {canDispute && record.status === ATTRIBUTION_STATUS.FINAL && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-amber-600 hover:text-amber-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDisputeTarget(record._id);
                    setDisputeReason("");
                  }}
                >
                  Dispute
                </Button>
              )}
              {canOverride && record.status === ATTRIBUTION_STATUS.DISPUTED && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-blue-600 hover:text-blue-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOverrideTarget(record._id);
                    setOverrideReason("");
                    setOverrideSplits(
                      splits.map((s) => ({
                        recipient_user_id: s.recipient_user_id,
                        amount_paise: String(s.amount_paise / 100),
                        notes: "",
                      })),
                    );
                  }}
                >
                  Override
                </Button>
              )}
            </span>
          </td>
        </tr>

        {isExpanded && splits.length > 0 && (
          <tr key={`${record._id}-splits`}>
            <td colSpan={7} className="bg-slate-50 px-4 py-3">
              <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      <th className="px-3 py-2">Recipient</th>
                      <th className="px-3 py-2">Stage</th>
                      <th className="px-3 py-2 text-right">Share %</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {splits.map((split) => (
                      <tr key={split._id}>
                        <td className="px-3 py-2 font-mono text-slate-600">
                          {truncateId(split.recipient_user_id)}
                          <span className="ml-1.5 text-[10px] text-slate-400">
                            {split.recipient_persona}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{split.primary_stage ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {(split.share_bps / 100).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {formatINR(split.amount_paise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        )}

        {isExpanded && splits.length === 0 && (
          <tr key={`${record._id}-empty`}>
            <td colSpan={7} className="bg-slate-50 px-4 py-3 text-center text-xs text-slate-400">
              No splits for this record.
            </td>
          </tr>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={statusFilter === filter.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {paginationStatus === "LoadingFirstPage" && (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      )}

      {paginationStatus !== "LoadingFirstPage" && results.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            No attribution records found for the selected filter.
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs font-medium uppercase tracking-wider text-slate-500">
                    <th className="w-8 px-4 py-3" />
                    <th className="px-4 py-3">Closure</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Pool</th>
                    <th className="px-4 py-3">Algorithm</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((item) => renderRecordRow(item.record, item.splits))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {paginationStatus === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => loadMore(20)}>
            Load More
          </Button>
        </div>
      )}

      {paginationStatus === "LoadingMore" && (
        <div className="flex justify-center py-4">
          <Loader2 className="size-5 animate-spin text-slate-400" />
        </div>
      )}

      <Dialog open={disputeTarget !== null} onOpenChange={() => setDisputeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispute Attribution</DialogTitle>
            <DialogDescription>
              Explain why this attribution is incorrect. The record will move to DISPUTED status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dispute-reason">Reason</Label>
            <Textarea
              id="dispute-reason"
              placeholder="Describe the issue with this attribution…"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeTarget(null)} disabled={isDisputing}>
              Cancel
            </Button>
            <Button
              onClick={handleDispute}
              disabled={isDisputing || !disputeReason.trim()}
              variant="destructive"
            >
              {isDisputing && <Loader2 className="mr-2 size-4 animate-spin" />}
              Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={overrideTarget !== null} onOpenChange={() => setOverrideTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Override Attribution</DialogTitle>
            <DialogDescription>
              Define manual splits. Amounts in ₹ (converted to paise). Total must match the pool.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="override-reason">Reason</Label>
              <Textarea
                id="override-reason"
                placeholder="Why is this override necessary?"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-3">
              <Label>Splits</Label>
              {overrideSplits.map((split, idx) => (
                <div
                  key={`split-${idx}-${split.recipient_user_id}`}
                  className="flex items-start gap-2"
                >
                  <div className="flex-1 space-y-1">
                    <Input
                      placeholder="User ID"
                      value={split.recipient_user_id}
                      onChange={(e) =>
                        updateOverrideSplit(idx, "recipient_user_id", e.target.value)
                      }
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Input
                      placeholder="₹ Amount"
                      type="number"
                      min={0}
                      value={split.amount_paise}
                      onChange={(e) => updateOverrideSplit(idx, "amount_paise", e.target.value)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOverrideSplit(idx)}
                    disabled={overrideSplits.length <= 1}
                    className="mt-0.5 text-slate-400 hover:text-red-500"
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addOverrideSplit}>
                + Add Split
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOverrideTarget(null)}
              disabled={isOverriding}
            >
              Cancel
            </Button>
            <Button onClick={handleOverride} disabled={isOverriding || !overrideReason.trim()}>
              {isOverriding && <Loader2 className="mr-2 size-4 animate-spin" />}
              Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
