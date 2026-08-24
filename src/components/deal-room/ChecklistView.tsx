"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, FileCheck, History, PartyPopper, Shield } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  DEAL_CHECKLIST_STATUS_COLORS,
  DEAL_CHECKLIST_STATUS_LABELS,
  type DealChecklistStatus,
  type DealTermType,
} from "../../../lib/constants";
import { formatDateTime, formatRelativeTime } from "../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { ChecklistItemCard, type EnrichedChecklistItem } from "./ChecklistItemCard";
import { SignOffDialog } from "./SignOffDialog";
import { VersionHistory } from "./VersionHistory";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChecklistViewProps = {
  checklistId: Id<"deal_checklists">;
  currentUserRole: "TENANT" | "OWNER" | "ADMIN";
  currentUserId: Id<"users">;
  isAdmin?: boolean;
  className?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERM_GROUP_ORDER: DealTermType[] = [
  "RENT_AMOUNT",
  "DEPOSIT",
  "MAINTENANCE",
  "LEASE_DURATION",
  "MOVE_IN_DATE",
  "LOCK_IN_PERIOD",
  "NOTICE_PERIOD",
  "ESCALATION_CLAUSE",
  "FURNISHING",
  "BROKERAGE",
  "CUSTOM",
];

const TERM_TYPE_LABELS: Record<DealTermType, string> = {
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
  CUSTOM: "Custom Terms",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChecklistView({
  checklistId,
  currentUserRole,
  currentUserId,
  isAdmin = false,
  className,
}: ChecklistViewProps) {
  const partyChecklist = useQuery(
    api.dealChecklistApprovals.getChecklistForParty,
    isAdmin ? "skip" : { checklist_id: checklistId },
  );

  const adminChecklist = useQuery(
    api.dealChecklists.getById,
    isAdmin ? { checklist_id: checklistId } : "skip",
  );

  const checklist = isAdmin ? adminChecklist : partyChecklist;

  const signatures = useQuery(api.dealChecklistApprovals.getSignatures, {
    checklist_id: checklistId,
  });

  const respondToItem = useMutation(api.dealChecklistApprovals.respondToItem);
  const signOffMutation = useMutation(api.dealChecklistApprovals.signOff);
  const signaturesLoading = signatures === undefined;

  const [signOffDialogOpen, setSignOffDialogOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);

  // Track supersession for real-time toast
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!checklist) return;
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = checklist.status;

    if (
      prevStatus !== undefined &&
      prevStatus !== "SUPERSEDED" &&
      checklist.status === "SUPERSEDED"
    ) {
      toast.info("Checklist updated — please review the new version", {
        duration: 6000,
      });
    }
  }, [checklist?.status, checklist]);

  const handleRespond = useCallback(
    async (itemId: string, response: "AGREED" | "DISAGREED" | "COMMENTED", comment?: string) => {
      try {
        await respondToItem({
          checklist_id: checklistId,
          item_id: itemId,
          response,
          comment,
        });
        toast.success("Response recorded");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to respond");
        throw error;
      }
    },
    [checklistId, respondToItem],
  );

  const handleSignOff = useCallback(async () => {
    try {
      const signature = await signOffMutation({
        checklist_id: checklistId,
      });
      toast.success("Checklist signed successfully!");
      if (signature) {
        return {
          signature_hash: signature.signature_hash,
          signed_at: signature.signed_at,
        };
      }
      return undefined;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sign off");
      return undefined;
    }
  }, [checklistId, signOffMutation]);

  // ---- Loading ----
  if (checklist === undefined) {
    return (
      <div className={cn("space-y-4 p-4", className)}>
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="space-y-3">
          {["skel-cl-a", "skel-cl-b", "skel-cl-c", "skel-cl-d"].map((key) => (
            <Skeleton key={key} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (checklist === null) {
    return (
      <div className={cn("flex flex-col items-center gap-3 p-8 text-center", className)}>
        <FileCheck className="size-10 text-slate-300" />
        <p className="text-sm text-slate-500">Checklist not found</p>
      </div>
    );
  }

  // ---- Computed values ----
  const status = checklist.status as DealChecklistStatus;
  const statusColor = DEAL_CHECKLIST_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600";
  const statusLabel = DEAL_CHECKLIST_STATUS_LABELS[status] ?? status;

  const items = checklist.items as EnrichedChecklistItem[];
  const totalItems = items.length;

  // Progress: count items where BOTH parties agreed
  const fullyAgreed = items.filter(
    (item) => item.tenant_approval.status === "AGREED" && item.owner_approval.status === "AGREED",
  ).length;
  const progressPct = totalItems > 0 ? Math.round((fullyAgreed / totalItems) * 100) : 0;

  // My sign-off eligibility
  const myAgreedCount =
    currentUserRole === "TENANT"
      ? items.filter((item) => item.tenant_approval.status === "AGREED").length
      : currentUserRole === "OWNER"
        ? items.filter((item) => item.owner_approval.status === "AGREED").length
        : 0;
  const allMyItemsAgreed = !isAdmin && totalItems > 0 && myAgreedCount === totalItems;
  const allItemsAgreed =
    totalItems > 0 &&
    items.every(
      (item) => item.tenant_approval.status === "AGREED" && item.owner_approval.status === "AGREED",
    );
  const waitingForOtherParty = allMyItemsAgreed && !allItemsAgreed;

  // Existing signatures
  const mySignature = signaturesLoading
    ? undefined
    : signatures?.find((sig) => sig.signer_user_id === currentUserId);
  const tenantSignature = signaturesLoading
    ? undefined
    : signatures?.find((sig) => sig.signer_role === "TENANT");
  const ownerSignature = signaturesLoading
    ? undefined
    : signatures?.find((sig) => sig.signer_role === "OWNER");

  const isApproved = status === "APPROVED";
  const isSuperseded = status === "SUPERSEDED";

  // ---- Group items by term_type ----
  const groupedItems = new Map<string, EnrichedChecklistItem[]>();
  for (const item of items) {
    const group = groupedItems.get(item.term_type) ?? [];
    group.push(item);
    groupedItems.set(item.term_type, group);
  }

  const orderedGroups = TERM_GROUP_ORDER.filter((type) => groupedItems.has(type)).map((type) => ({
    type,
    label: TERM_TYPE_LABELS[type] ?? type,
    items: groupedItems.get(type)!,
  }));

  // Add any groups not in the fixed order
  for (const [type, groupItems] of groupedItems) {
    if (!TERM_GROUP_ORDER.includes(type as DealTermType)) {
      orderedGroups.push({
        type: type as DealTermType,
        label: TERM_TYPE_LABELS[type as DealTermType] ?? type,
        items: groupItems,
      });
    }
  }

  return (
    <div className={cn("space-y-5", className)}>
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileCheck className="size-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Deal Checklist <span className="text-slate-400">v{checklist.version}</span>
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={cn("text-xs font-semibold", statusColor)}>
            {statusLabel}
          </Badge>
          {isAdmin && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setVersionHistoryOpen(true);
              }}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              <History className="mr-1 size-3.5" />
              History
            </Button>
          )}
        </div>
      </div>

      {/* ---- Superseded Banner ---- */}
      {isSuperseded && (
        <div className="rounded-lg border border-slate-300 bg-slate-100 p-3 text-center text-sm text-slate-600">
          This checklist has been superseded by a newer version.
        </div>
      )}

      {/* ---- Approved Banner ---- */}
      {isApproved && (
        <div className="rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <PartyPopper className="size-5 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-800">
              Both parties signed — Deal Approved!
            </span>
            <PartyPopper className="size-5 text-emerald-600" />
          </div>
          {checklist.approved_at && (
            <p className="mt-1 text-xs text-emerald-600">
              Approved {formatRelativeTime(checklist.approved_at)}
            </p>
          )}
        </div>
      )}

      {/* ---- Progress Bar ---- */}
      <div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-600">
            {fullyAgreed} of {totalItems} items fully agreed
          </span>
          <span className="font-bold text-slate-800">{progressPct}%</span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
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

      {/* ---- Grouped Items ---- */}
      {orderedGroups.map((group) => (
        <div key={group.type}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            {group.label}
          </h3>
          <div className="space-y-2">
            {group.items.map((item) => (
              <ChecklistItemCard
                key={item.item_id}
                item={item}
                currentUserRole={currentUserRole}
                checklistStatus={status}
                action={handleRespond}
              />
            ))}
          </div>
        </div>
      ))}

      <Separator />

      {/* ---- Signatures Section ---- */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Signatures</h3>

        <div className="grid grid-cols-2 gap-3">
          {/* Tenant Signature */}
          <div
            className={cn(
              "rounded-lg border p-3",
              tenantSignature
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-slate-200 bg-slate-50",
            )}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Tenant
            </span>
            {signaturesLoading ? (
              <div className="mt-1.5 space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            ) : tenantSignature ? (
              <div className="mt-1.5 flex items-center gap-1.5">
                <Check className="size-4 text-emerald-600" />
                <div>
                  <p className="text-xs font-semibold text-emerald-700">Signed</p>
                  <p className="font-mono text-[10px] text-emerald-600">
                    {tenantSignature.signature_hash.slice(0, 12)}...
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {formatDateTime(tenantSignature.signed_at)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-slate-400">Not yet signed</p>
            )}
          </div>

          {/* Owner Signature */}
          <div
            className={cn(
              "rounded-lg border p-3",
              ownerSignature
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-slate-200 bg-slate-50",
            )}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Owner
            </span>
            {signaturesLoading ? (
              <div className="mt-1.5 space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            ) : ownerSignature ? (
              <div className="mt-1.5 flex items-center gap-1.5">
                <Check className="size-4 text-emerald-600" />
                <div>
                  <p className="text-xs font-semibold text-emerald-700">Signed</p>
                  <p className="font-mono text-[10px] text-emerald-600">
                    {ownerSignature.signature_hash.slice(0, 12)}...
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {formatDateTime(ownerSignature.signed_at)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-slate-400">Not yet signed</p>
            )}
          </div>
        </div>

        {/* My Signature Receipt */}
        {!signaturesLoading && mySignature && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">
                Your signature is on record
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-emerald-600">
              Hash: {mySignature.signature_hash.slice(0, 16)}...
              {mySignature.signature_hash.slice(-16)}
            </p>
            <p className="text-[10px] text-emerald-500">
              Signed {formatDateTime(mySignature.signed_at)}
            </p>
          </div>
        )}
      </div>

      {/* ---- Sign-Off Button ---- */}
      {!isAdmin && !isApproved && !isSuperseded && !signaturesLoading && !mySignature && (
        <Button
          type="button"
          onClick={() => setSignOffDialogOpen(true)}
          disabled={!allItemsAgreed}
          className={cn(
            "w-full",
            allItemsAgreed
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-slate-400 cursor-not-allowed",
          )}
        >
          <Shield className="mr-2 size-4" />
          {allItemsAgreed
            ? "Sign Off on All Terms"
            : waitingForOtherParty
              ? "Waiting for other party to agree"
              : `Agree to all items first (${myAgreedCount}/${totalItems})`}
        </Button>
      )}

      {/* ---- Dialogs ---- */}
      <SignOffDialog
        open={signOffDialogOpen}
        onOpenChangeAction={setSignOffDialogOpen}
        checklistId={checklistId}
        items={checklist.items}
        currentUserRole={currentUserRole}
        onSignOffAction={handleSignOff}
      />

      {isAdmin && (
        <VersionHistory
          inquiryId={checklist.inquiry_id}
          open={versionHistoryOpen}
          onOpenChange={setVersionHistoryOpen}
          currentVersionId={checklistId}
        />
      )}
    </div>
  );
}
