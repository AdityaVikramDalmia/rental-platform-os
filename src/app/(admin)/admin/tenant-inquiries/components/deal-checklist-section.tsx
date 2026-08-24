"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Check,
  Edit3,
  FileCheck,
  GitCompare,
  History,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../../convex/_generated/dataModel";
import {
  DEAL_CHECKLIST_ITEM_APPROVAL,
  DEAL_CHECKLIST_ITEM_OVERALL_STATUS,
  DEAL_CHECKLIST_STATUS,
  DEAL_CHECKLIST_STATUS_COLORS,
  DEAL_CHECKLIST_STATUS_LABELS,
  type DealChecklistItemApproval,
  type DealChecklistItemOverallStatus,
  type DealChecklistStatus,
  type DealTermType,
} from "../../../../../../lib/constants";
import { formatDateTime, formatRelativeTime } from "../../../../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DisputeResolutionDialog } from "./dispute-resolution-dialog";
import { RegenerateChecklistDialog } from "./regenerate-checklist-dialog";
import { VersionDiffView } from "./version-diff-view";

type DealChecklistSectionProps = {
  inquiryId: Id<"tenant_inquiries">;
  channelId?: Id<"chat_channels">;
  canManage: boolean;
};

type ChecklistItem = Doc<"deal_checklists">["items"][number];

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

const APPROVAL_COLORS: Record<string, string> = {
  [DEAL_CHECKLIST_ITEM_APPROVAL.PENDING]: "bg-slate-100 text-slate-500 border-slate-200",
  [DEAL_CHECKLIST_ITEM_APPROVAL.AGREED]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [DEAL_CHECKLIST_ITEM_APPROVAL.DISAGREED]: "bg-rose-50 text-rose-700 border-rose-200",
  [DEAL_CHECKLIST_ITEM_APPROVAL.COMMENTED]: "bg-sky-50 text-sky-700 border-sky-200",
};

const APPROVAL_LABELS: Record<string, string> = {
  [DEAL_CHECKLIST_ITEM_APPROVAL.PENDING]: "Pending",
  [DEAL_CHECKLIST_ITEM_APPROVAL.AGREED]: "Agreed",
  [DEAL_CHECKLIST_ITEM_APPROVAL.DISAGREED]: "Disagreed",
  [DEAL_CHECKLIST_ITEM_APPROVAL.COMMENTED]: "Commented",
};

const OVERALL_STATUS_COLORS: Record<string, string> = {
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.UNREVIEWED]: "bg-slate-100 text-slate-600",
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.RESOLVED]: "bg-emerald-100 text-emerald-700",
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.DISPUTED]: "bg-rose-100 text-rose-700",
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.NEEDS_DISCUSSION]: "bg-amber-100 text-amber-700",
};

const OVERALL_STATUS_LABELS: Record<string, string> = {
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.UNREVIEWED]: "Unreviewed",
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.RESOLVED]: "Resolved",
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.DISPUTED]: "Disputed",
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.NEEDS_DISCUSSION]: "Needs Discussion",
};

function ApprovalBadge({
  label,
  status,
  comment,
  respondedAt,
}: {
  label: string;
  status: string;
  comment?: string;
  respondedAt?: number;
}) {
  const colorClass = APPROVAL_COLORS[status] ?? APPROVAL_COLORS.PENDING;
  const statusLabel = APPROVAL_LABELS[status] ?? status;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <Badge variant="outline" className={cn("text-[10px] font-semibold", colorClass)}>
        {status === "AGREED" && <Check className="mr-0.5 size-2.5" />}
        {status === "DISAGREED" && <X className="mr-0.5 size-2.5" />}
        {status === "COMMENTED" && <MessageSquare className="mr-0.5 size-2.5" />}
        {statusLabel}
      </Badge>
      {comment && (
        <p className="mt-0.5 max-w-[140px] truncate text-[10px] text-slate-500 italic">
          &ldquo;{comment}&rdquo;
        </p>
      )}
      {respondedAt && (
        <span className="text-[9px] text-slate-400">{formatRelativeTime(respondedAt)}</span>
      )}
    </div>
  );
}

function InlineEditableValue({
  item,
  checklistId,
  isDraft,
  canManage,
}: {
  item: ChecklistItem;
  checklistId: Id<"deal_checklists">;
  isDraft: boolean;
  canManage: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const editItem = useMutation(api.dealChecklists.editItem);

  const displayValue = item.admin_edited_value ?? item.extracted_value;
  const isEdited = !!item.admin_edited_value && !!item.extracted_value;
  const canEdit = isDraft && canManage;

  const handleStartEdit = useCallback(() => {
    setEditValue(displayValue ?? "");
    setIsEditing(true);
  }, [displayValue]);

  const handleSave = useCallback(async () => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      await editItem({
        checklist_id: checklistId,
        item_id: item.item_id,
        admin_edited_value: trimmed,
      });
      toast.success("Value updated");
      setIsEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update value");
    } finally {
      setIsSaving(false);
    }
  }, [editValue, editItem, checklistId, item.item_id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleSave();
      } else if (e.key === "Escape") {
        setIsEditing(false);
      }
    },
    [handleSave],
  );

  if (isEditing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-7 text-xs"
          autoFocus
          disabled={isSaving}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Save changes"
          className="size-7 p-0"
          onClick={() => void handleSave()}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Cancel editing"
          className="size-7 p-0"
          onClick={() => setIsEditing(false)}
          disabled={isSaving}
        >
          <X className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-semibold text-slate-900">{displayValue ?? "—"}</span>
      {isEdited && <span className="text-[9px] font-medium text-amber-600">(edited)</span>}
      {canEdit && (
        <button
          type="button"
          aria-label="Edit value"
          onClick={handleStartEdit}
          className="ml-0.5 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <Edit3 className="size-3" />
        </button>
      )}
    </div>
  );
}

export function DealChecklistSection({
  inquiryId,
  channelId,
  canManage,
}: DealChecklistSectionProps) {
  const checklist = useQuery(api.dealChecklists.getByInquiry, { inquiry_id: inquiryId });
  const versions = useQuery(api.dealChecklists.listVersions, { inquiry_id: inquiryId });

  const generateFromChat = useAction(api.dealChecklists.generateFromChat);
  const shareChecklist = useMutation(api.dealChecklists.share);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [disputeItem, setDisputeItem] = useState<ChecklistItem | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<Id<"deal_checklists"> | null>(null);

  const selectedVersion = useQuery(
    api.dealChecklists.getById,
    selectedVersionId ? { checklist_id: selectedVersionId } : "skip",
  );

  const activeChecklistId = selectedVersionId ?? checklist?._id ?? null;
  const signatures = useQuery(
    api.dealChecklistApprovals.getSignatures,
    activeChecklistId ? { checklist_id: activeChecklistId } : "skip",
  );

  const activeChecklist = selectedVersionId ? (selectedVersion ?? checklist) : checklist;

  const isLoading = checklist === undefined;

  async function handleGenerate() {
    if (!channelId) return;
    setIsGenerating(true);
    try {
      const result = await generateFromChat({
        inquiry_id: inquiryId,
        channel_id: channelId,
      });
      if (result.success) {
        toast.success(
          `Checklist generated — ${result.extracted_terms_count} terms extracted from ${result.analyzed_message_count} messages`,
        );
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate checklist");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleShare() {
    if (!activeChecklist) return;
    setIsSharing(true);
    try {
      await shareChecklist({ checklist_id: activeChecklist._id });
      toast.success("Checklist shared with parties");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to share checklist");
    } finally {
      setIsSharing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  if (checklist === null) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-4 text-center">
        <FileCheck className="mx-auto size-8 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">No deal checklist yet</p>
        {canManage && channelId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
            onClick={() => void handleGenerate()}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Extracting terms...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generate Deal Checklist
              </>
            )}
          </Button>
        )}
        {!channelId && canManage && (
          <p className="mt-2 text-[11px] text-slate-400">
            Open a chat channel first to generate a checklist from conversation.
          </p>
        )}
      </div>
    );
  }

  if (selectedVersionId && selectedVersion === undefined) {
    return <Skeleton className="h-40 w-full rounded-lg" />;
  }

  const status = (activeChecklist?.status ?? checklist.status) as DealChecklistStatus;
  const statusColor = DEAL_CHECKLIST_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600";
  const statusLabel = DEAL_CHECKLIST_STATUS_LABELS[status] ?? status;
  const items = activeChecklist?.items ?? checklist.items;
  const version = activeChecklist?.version ?? checklist.version;
  const isDraft = status === DEAL_CHECKLIST_STATUS.DRAFT;
  const isSuperseded = status === DEAL_CHECKLIST_STATUS.SUPERSEDED;
  const isApproved = status === DEAL_CHECKLIST_STATUS.APPROVED;
  const resolvedChecklistId = activeChecklist?._id ?? checklist._id;

  const fullyAgreed = items.filter(
    (item) => item.tenant_approval.status === "AGREED" && item.owner_approval.status === "AGREED",
  ).length;
  const progressPct = items.length > 0 ? Math.round((fullyAgreed / items.length) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900">v{version}</span>
          <Badge variant="secondary" className={cn("text-[10px] font-semibold", statusColor)}>
            {statusLabel}
          </Badge>
        </div>

        {versions && versions.length > 1 && (
          <Select
            value={selectedVersionId ?? "__latest__"}
            onValueChange={(val) =>
              setSelectedVersionId(val === "__latest__" ? null : (val as Id<"deal_checklists">))
            }
          >
            <SelectTrigger className="h-7 w-auto min-w-[120px] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__latest__">Latest (v{checklist.version})</SelectItem>
              {versions
                .filter((v) => v._id !== checklist._id)
                .map((v) => (
                  <SelectItem key={v._id} value={v._id}>
                    v{v.version} — {DEAL_CHECKLIST_STATUS_LABELS[v.status as DealChecklistStatus]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isSuperseded && (
        <div className="rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-center text-xs text-slate-600">
          This checklist has been superseded by a newer version.
        </div>
      )}

      {isApproved && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700">
          ✅ Both parties signed — Deal Approved
        </div>
      )}

      {!isDraft && (
        <div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">
              {fullyAgreed}/{items.length} fully agreed
            </span>
            <span className="font-bold text-slate-700">{progressPct}%</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progressPct === 100
                  ? "bg-emerald-500"
                  : progressPct > 50
                    ? "bg-emerald-400"
                    : progressPct > 0
                      ? "bg-amber-400"
                      : "bg-slate-300",
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {canManage && !isSuperseded && (
        <div className="flex flex-wrap gap-1.5">
          {isDraft && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 border-blue-300 text-xs text-blue-700 hover:bg-blue-50"
              onClick={() => void handleShare()}
              disabled={isSharing}
            >
              {isSharing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Send className="size-3" />
              )}
              Share with Parties
            </Button>
          )}

          {!isApproved && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 border-amber-300 text-xs text-amber-700 hover:bg-amber-50"
              onClick={() => setRegenerateOpen(true)}
            >
              <RotateCcw className="size-3" />
              Regenerate
            </Button>
          )}

          {versions && versions.length > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs text-slate-600"
              onClick={() => setDiffOpen(true)}
            >
              <GitCompare className="size-3" />
              Compare
            </Button>
          )}

          {versions && versions.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-slate-500"
              onClick={() => setDiffOpen(true)}
            >
              <History className="size-3" />
              {versions.length} version{versions.length > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => {
          const emoji = TERM_TYPE_EMOJIS[item.term_type] ?? "📝";
          const termLabel = TERM_TYPE_LABELS[item.term_type] ?? item.term_type;
          const overallStatus = item.overall_status as DealChecklistItemOverallStatus;
          const overallColor = OVERALL_STATUS_COLORS[overallStatus] ?? "";
          const overallLabel = OVERALL_STATUS_LABELS[overallStatus] ?? overallStatus;
          const isDisputed = overallStatus === DEAL_CHECKLIST_ITEM_OVERALL_STATUS.DISPUTED;
          const lowConfidence = item.confidence !== undefined && item.confidence < 0.5;

          return (
            <div
              key={`${resolvedChecklistId}-${item.item_id}`}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                isDisputed && "border-rose-200 bg-rose-50/30",
                overallStatus === "RESOLVED" && "border-emerald-200 bg-emerald-50/20",
                overallStatus === "NEEDS_DISCUSSION" && "border-amber-200 bg-amber-50/20",
                overallStatus === "UNREVIEWED" && "border-slate-200",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm leading-none">{emoji}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {termLabel}
                  </span>
                  {lowConfidence && (
                    <Badge
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-[9px] font-semibold text-amber-600"
                    >
                      <AlertTriangle className="mr-0.5 size-2.5" />
                      Low
                    </Badge>
                  )}
                </div>
                <Badge
                  variant="secondary"
                  className={cn("shrink-0 text-[9px] font-semibold", overallColor)}
                >
                  {overallLabel}
                </Badge>
              </div>

              <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.description}</p>

              <div className="mt-1.5">
                <InlineEditableValue
                  item={item}
                  checklistId={resolvedChecklistId}
                  isDraft={isDraft}
                  canManage={canManage}
                />
              </div>

              <Separator className="my-2" />

              <div className="grid grid-cols-2 gap-3">
                <ApprovalBadge
                  label="Tenant"
                  status={item.tenant_approval.status}
                  comment={item.tenant_approval.comment}
                  respondedAt={item.tenant_approval.responded_at}
                />
                <ApprovalBadge
                  label="Owner"
                  status={item.owner_approval.status}
                  comment={item.owner_approval.comment}
                  respondedAt={item.owner_approval.responded_at}
                />
              </div>

              {isDisputed &&
                canManage &&
                !isSuperseded &&
                status === DEAL_CHECKLIST_STATUS.DISPUTED && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-6 w-full border-amber-300 text-[10px] font-semibold text-amber-700 hover:bg-amber-50"
                    onClick={() => setDisputeItem(item)}
                  >
                    <AlertTriangle className="size-3" />
                    Resolve Dispute
                  </Button>
                )}
            </div>
          );
        })}
      </div>

      {signatures && signatures.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Signatures
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {signatures.map((sig) => (
              <div
                key={sig._id}
                className="rounded-md border border-emerald-200 bg-emerald-50/50 px-2.5 py-2"
              >
                <div className="flex items-center gap-1.5">
                  <Shield className="size-3 text-emerald-600" />
                  <span className="text-[10px] font-semibold text-emerald-700">
                    {sig.signer_role}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[9px] text-emerald-600 truncate">
                  {sig.signature_hash.slice(0, 12)}...
                </p>
                <p className="text-[9px] text-slate-400">{formatDateTime(sig.signed_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {checklist && (
        <>
          <RegenerateChecklistDialog
            open={regenerateOpen}
            onOpenChange={setRegenerateOpen}
            checklistId={resolvedChecklistId}
            currentVersion={version}
          />

          <VersionDiffView open={diffOpen} onOpenChange={setDiffOpen} inquiryId={inquiryId} />

          {disputeItem && (
            <DisputeResolutionDialog
              open={!!disputeItem}
              onOpenChange={(open) => {
                if (!open) setDisputeItem(null);
              }}
              checklistId={resolvedChecklistId}
              item={{
                item_id: disputeItem.item_id,
                term_type: disputeItem.term_type,
                description: disputeItem.description,
                extracted_value: disputeItem.extracted_value,
                admin_edited_value: disputeItem.admin_edited_value,
                tenant_comment: disputeItem.tenant_approval.comment,
                owner_comment: disputeItem.owner_approval.comment,
                tenant_status: disputeItem.tenant_approval.status,
                owner_status: disputeItem.owner_approval.status,
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
