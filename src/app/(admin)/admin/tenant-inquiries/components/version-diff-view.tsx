"use client";

import { useQuery } from "convex/react";
import { ArrowRight, GitCompare, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../../convex/_generated/dataModel";
import {
  DEAL_CHECKLIST_STATUS_COLORS,
  DEAL_CHECKLIST_STATUS_LABELS,
  type DealChecklistStatus,
} from "../../../../../../lib/constants";
import { formatDateTime } from "../../../../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type VersionDiffViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiryId: Id<"tenant_inquiries">;
};

type ChecklistItem = Doc<"deal_checklists">["items"][number];

type DiffResult = {
  kind: "added" | "removed" | "changed" | "unchanged";
  itemId: string;
  termType: string;
  description: string;
  oldValue?: string;
  newValue?: string;
  oldStatus?: string;
  newStatus?: string;
};

const TERM_TYPE_LABELS: Record<string, string> = {
  RENT_AMOUNT: "Rent Amount",
  DEPOSIT: "Security Deposit",
  LEASE_DURATION: "Lease Duration",
  MOVE_IN_DATE: "Move-in Date",
  MAINTENANCE: "Maintenance",
  ESCALATION_CLAUSE: "Escalation Clause",
  FURNISHING: "Furnishing",
  LOCK_IN_PERIOD: "Lock-in Period",
  NOTICE_PERIOD: "Notice Period",
  BROKERAGE: "Brokerage",
  CUSTOM: "Custom Term",
};

const TERM_TYPE_EMOJIS: Record<string, string> = {
  RENT_AMOUNT: "💰",
  DEPOSIT: "🏦",
  LEASE_DURATION: "📅",
  MOVE_IN_DATE: "🗓️",
  MAINTENANCE: "🔧",
  ESCALATION_CLAUSE: "📈",
  FURNISHING: "🛋️",
  LOCK_IN_PERIOD: "🔒",
  NOTICE_PERIOD: "📋",
  BROKERAGE: "🤝",
  CUSTOM: "⚙️",
};

function getItemValue(item: ChecklistItem): string {
  return item.admin_edited_value ?? item.extracted_value ?? "";
}

function computeDiff(itemsA: ChecklistItem[], itemsB: ChecklistItem[]): DiffResult[] {
  const results: DiffResult[] = [];
  const mapA = new Map(itemsA.map((item) => [item.item_id, item]));
  const mapB = new Map(itemsB.map((item) => [item.item_id, item]));

  for (const itemB of itemsB) {
    const itemA = mapA.get(itemB.item_id);

    if (!itemA) {
      const fuzzyMatch = itemsA.find(
        (a) =>
          !mapB.has(a.item_id) &&
          a.term_type === itemB.term_type &&
          a.description === itemB.description,
      );

      if (fuzzyMatch) {
        const oldVal = getItemValue(fuzzyMatch);
        const newVal = getItemValue(itemB);
        results.push({
          kind:
            oldVal !== newVal || fuzzyMatch.overall_status !== itemB.overall_status
              ? "changed"
              : "unchanged",
          itemId: itemB.item_id,
          termType: itemB.term_type,
          description: itemB.description,
          oldValue: oldVal,
          newValue: newVal,
          oldStatus: fuzzyMatch.overall_status,
          newStatus: itemB.overall_status,
        });
        mapA.delete(fuzzyMatch.item_id);
      } else {
        results.push({
          kind: "added",
          itemId: itemB.item_id,
          termType: itemB.term_type,
          description: itemB.description,
          newValue: getItemValue(itemB),
          newStatus: itemB.overall_status,
        });
      }
    } else {
      const oldVal = getItemValue(itemA);
      const newVal = getItemValue(itemB);
      const changed = oldVal !== newVal || itemA.overall_status !== itemB.overall_status;
      results.push({
        kind: changed ? "changed" : "unchanged",
        itemId: itemB.item_id,
        termType: itemB.term_type,
        description: itemB.description,
        oldValue: oldVal,
        newValue: newVal,
        oldStatus: itemA.overall_status,
        newStatus: itemB.overall_status,
      });
      mapA.delete(itemA.item_id);
    }
  }

  for (const [, itemA] of mapA) {
    results.push({
      kind: "removed",
      itemId: itemA.item_id,
      termType: itemA.term_type,
      description: itemA.description,
      oldValue: getItemValue(itemA),
      oldStatus: itemA.overall_status,
    });
  }

  return results;
}

const DIFF_STYLES: Record<
  DiffResult["kind"],
  { bg: string; border: string; icon: React.ReactNode; label: string }
> = {
  added: {
    bg: "bg-emerald-50/60",
    border: "border-emerald-200",
    icon: <Plus className="size-3.5 text-emerald-600" />,
    label: "Added",
  },
  removed: {
    bg: "bg-rose-50/60",
    border: "border-rose-200",
    icon: <Minus className="size-3.5 text-rose-600" />,
    label: "Removed",
  },
  changed: {
    bg: "bg-amber-50/60",
    border: "border-amber-200",
    icon: <ArrowRight className="size-3.5 text-amber-600" />,
    label: "Changed",
  },
  unchanged: {
    bg: "bg-white",
    border: "border-slate-200",
    icon: null,
    label: "Unchanged",
  },
};

export function VersionDiffView({ open, onOpenChange, inquiryId }: VersionDiffViewProps) {
  const versions = useQuery(
    api.dealChecklists.listVersions,
    open ? { inquiry_id: inquiryId } : "skip",
  );

  const [versionASelection, setVersionASelection] = useState<string>("");
  const [versionBSelection, setVersionBSelection] = useState<string>("");
  const [previousInquiryId, setPreviousInquiryId] = useState<Id<"tenant_inquiries"> | null>(null);

  // Reset the user's version picks whenever the dialog is shown for a different
  // inquiry. Adjusting state directly during render (rather than in an effect)
  // avoids an extra commit-then-effect-then-recommit render cascade.
  if (previousInquiryId !== inquiryId) {
    setPreviousInquiryId(inquiryId);
    setVersionASelection("");
    setVersionBSelection("");
  }

  const hasVersionOptions = Boolean(versions && versions.length >= 2);
  // Default to comparing the two most recent versions until the user picks
  // explicitly; this derives the effective selection from the loaded versions
  // instead of syncing it into state via an effect.
  const versionAId = versionASelection || (hasVersionOptions ? versions![1]._id : "");
  const versionBId = versionBSelection || (hasVersionOptions ? versions![0]._id : "");

  const versionA = useQuery(
    api.dealChecklists.getById,
    open && versionAId ? { checklist_id: versionAId as Id<"deal_checklists"> } : "skip",
  );
  const versionB = useQuery(
    api.dealChecklists.getById,
    open && versionBId ? { checklist_id: versionBId as Id<"deal_checklists"> } : "skip",
  );

  const diffResults = useMemo(() => {
    if (!versionA || !versionB) return null;
    return computeDiff(versionA.items, versionB.items);
  }, [versionA, versionB]);

  const isLoading = versions === undefined;
  const hasSingleVersion = versions && versions.length < 2;

  const changedCount = diffResults?.filter((d) => d.kind !== "unchanged").length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-indigo-100">
              <GitCompare className="size-4 text-indigo-600" />
            </div>
            Version Comparison
          </DialogTitle>
          <DialogDescription>
            Compare two checklist versions side-by-side to see what changed.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {!isLoading && hasSingleVersion && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <GitCompare className="size-10 text-slate-300" />
            <p className="text-sm text-slate-500">
              Only one version exists. Create a new version to compare.
            </p>
          </div>
        )}

        {!isLoading && versions && versions.length >= 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Version A (older)
                </span>
                <Select value={versionAId} onValueChange={setVersionASelection}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((v) => (
                      <SelectItem key={v._id} value={v._id} disabled={v._id === versionBId}>
                        v{v.version} — {formatDateTime(v.created_at)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Version B (newer)
                </span>
                <Select value={versionBId} onValueChange={setVersionBSelection}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((v) => (
                      <SelectItem key={v._id} value={v._id} disabled={v._id === versionAId}>
                        v{v.version} — {formatDateTime(v.created_at)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {versionA && versionB && (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] font-semibold",
                      DEAL_CHECKLIST_STATUS_COLORS[versionA.status as DealChecklistStatus],
                    )}
                  >
                    v{versionA.version}:{" "}
                    {DEAL_CHECKLIST_STATUS_LABELS[versionA.status as DealChecklistStatus]}
                  </Badge>
                  <ArrowRight className="size-3.5 text-slate-400" />
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] font-semibold",
                      DEAL_CHECKLIST_STATUS_COLORS[versionB.status as DealChecklistStatus],
                    )}
                  >
                    v{versionB.version}:{" "}
                    {DEAL_CHECKLIST_STATUS_LABELS[versionB.status as DealChecklistStatus]}
                  </Badge>
                </div>
                {changedCount > 0 && (
                  <span className="text-xs font-medium text-slate-500">
                    {changedCount} change{changedCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}

            {diffResults && (
              <div className="space-y-2">
                {diffResults.length === 0 && (
                  <p className="py-6 text-center text-sm text-slate-500">No items to compare.</p>
                )}
                {diffResults.map((diff) => {
                  const style = DIFF_STYLES[diff.kind];
                  const emoji = TERM_TYPE_EMOJIS[diff.termType] ?? "📝";
                  const label = TERM_TYPE_LABELS[diff.termType] ?? diff.termType;

                  return (
                    <div
                      key={diff.itemId}
                      className={cn(
                        "rounded-lg border p-3 transition-colors",
                        style.bg,
                        style.border,
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm leading-none">{emoji}</span>
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            {label}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold",
                            diff.kind === "added" &&
                              "border-emerald-300 bg-emerald-100 text-emerald-700",
                            diff.kind === "removed" && "border-rose-300 bg-rose-100 text-rose-700",
                            diff.kind === "changed" &&
                              "border-amber-300 bg-amber-100 text-amber-700",
                            diff.kind === "unchanged" &&
                              "border-slate-200 bg-slate-100 text-slate-500",
                          )}
                        >
                          {style.icon}
                          <span className="ml-1">{style.label}</span>
                        </Badge>
                      </div>

                      <p className="mt-1.5 text-sm text-slate-700">{diff.description}</p>

                      {diff.kind === "changed" && (
                        <div className="mt-2 flex items-center gap-2 text-sm">
                          <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 line-through text-rose-600">
                            {diff.oldValue || "—"}
                          </span>
                          <ArrowRight className="size-3.5 text-slate-400" />
                          <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                            {diff.newValue || "—"}
                          </span>
                        </div>
                      )}

                      {diff.kind === "added" && diff.newValue && (
                        <div className="mt-2">
                          <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-sm font-semibold text-emerald-700">
                            {diff.newValue}
                          </span>
                        </div>
                      )}

                      {diff.kind === "removed" && diff.oldValue && (
                        <div className="mt-2">
                          <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-sm line-through text-rose-600">
                            {diff.oldValue}
                          </span>
                        </div>
                      )}

                      {diff.kind === "unchanged" && diff.newValue && (
                        <div className="mt-2">
                          <span className="text-sm text-slate-600">{diff.newValue}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {versionAId && versionBId && (!versionA || !versionB) && (
              <div className="space-y-3 py-4">
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
