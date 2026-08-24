"use client";

import { Check, FileCheck, Shield } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Doc } from "../../../convex/_generated/dataModel";
import { formatDateTime } from "../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DealChecklist = Doc<"deal_checklists">;
type ChecklistItem = DealChecklist["items"][number];

type SignOffDialogProps = {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  checklistId: string;
  items: ChecklistItem[];
  currentUserRole: "TENANT" | "OWNER" | "ADMIN";
  onSignOffAction: () => Promise<SignatureReceipt | undefined>;
};

type SignatureReceipt = {
  signature_hash: string;
  signed_at: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SignOffDialog({
  open,
  onOpenChangeAction,
  checklistId: _checklistId,
  items,
  currentUserRole,
  onSignOffAction,
}: SignOffDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<SignatureReceipt | null>(null);

  const approvalField = currentUserRole === "TENANT" ? "tenant_approval" : "owner_approval";
  const hasItems = items.length > 0;

  const allAgreed = hasItems && items.every((item) => item[approvalField].status === "AGREED");
  const bothPartiesAgreed =
    hasItems &&
    items.every(
      (item) => item.tenant_approval.status === "AGREED" && item.owner_approval.status === "AGREED",
    );
  const waitingForOtherParty = hasItems && allAgreed && !bothPartiesAgreed;

  const agreedItems = items.filter((item) => item[approvalField].status === "AGREED");

  async function handleSignOff() {
    if (!items || items.length === 0) {
      toast.error("Cannot sign off on an empty checklist");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSignOffAction();
      if (result) {
        setReceipt(result);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setReceipt(null);
    }
    onOpenChangeAction(nextOpen);
  }

  // ---- Receipt View ----
  if (receipt) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-emerald-100">
                <Shield className="size-4 text-emerald-600" />
              </div>
              Signed Successfully
            </DialogTitle>
            <DialogDescription>Your digital signature has been recorded.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="flex items-center gap-2">
                <Check className="size-5 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-800">Agreement Signed</span>
              </div>

              <Separator className="my-3 bg-emerald-200" />

              <div className="space-y-2.5">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                    Signature Hash (SHA-256)
                  </span>
                  <p className="mt-0.5 break-all font-mono text-xs leading-relaxed text-emerald-900">
                    {receipt.signature_hash.slice(0, 16)}...
                    {receipt.signature_hash.slice(-16)}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                    Signed At
                  </span>
                  <p className="mt-0.5 text-xs text-emerald-900">
                    {formatDateTime(receipt.signed_at)}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                    Role
                  </span>
                  <p className="mt-0.5 text-xs text-emerald-900">
                    {currentUserRole === "TENANT" ? "Tenant" : "Owner"}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-center text-[11px] text-slate-500">
              Keep a copy of this hash for your records.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => handleClose(false)} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ---- Confirmation View ----
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="size-5 text-indigo-600" />
            Sign Off on Deal Terms
          </DialogTitle>
          <DialogDescription>
            Review the agreed terms below before signing. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Agreed Terms Summary */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Agreed Terms ({agreedItems.length} of {items.length})
            </h4>
            <div className="rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-200">
              {agreedItems.map((item) => {
                const value = item.admin_edited_value ?? item.extracted_value;
                return (
                  <div
                    key={item.item_id}
                    className="flex items-start justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {TERM_TYPE_LABELS[item.term_type] ?? item.term_type}
                      </span>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-700">
                        {item.description}
                      </p>
                    </div>
                    {value && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700"
                      >
                        {value}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Warning */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs leading-relaxed text-amber-800">
              <strong>By signing,</strong> you confirm agreement to all terms listed above. A
              SHA-256 digital signature will be generated and recorded as your binding consent.
            </p>
          </div>

          {!hasItems && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs text-rose-700">
                Cannot sign off on an empty checklist. Ask admin to add terms first.
              </p>
            </div>
          )}

          {hasItems && !allAgreed && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs text-rose-700">
                You must agree to all {items.length} items before signing.
                {items.length - agreedItems.length} item(s) still pending.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!hasItems || !allAgreed || !bothPartiesAgreed || isSubmitting}
              onClick={handleSignOff}
              className={cn(
                allAgreed && bothPartiesAgreed
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-slate-400",
              )}
            >
              {isSubmitting ? (
                "Signing..."
              ) : (
                <>
                  <Shield className="mr-1.5 size-4" />
                  Sign & Confirm
                </>
              )}
            </Button>
          </DialogFooter>

          {waitingForOtherParty && (
            <p className="text-center text-xs text-slate-500">
              Waiting for the other party to agree on all terms before sign-off is possible.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
