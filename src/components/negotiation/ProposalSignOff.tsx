"use client";

import { useMutation } from "convex/react";
import { Check, FileCheck, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatDateTime } from "../../../lib/dates";
import { formatINR } from "../../../lib/money";
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

interface ProposalSignOffProps {
  proposalId: Id<"negotiation_terms_proposals">;
  proposalVersion: number;
  signatures: Array<{
    user_role: string;
    signed_at: number;
    agreement_text: string;
  }>;
  canSign: boolean;
  userRole?: "TENANT" | "OWNER";
  onSignSuccess?: () => void;
  proposalSummary?: {
    monthly_rent_paise: number;
    security_deposit_paise: number;
    token_advance_amount_paise: number;
  };
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

const AGREEMENT_TEMPLATE =
  "I agree to the terms outlined in Proposal v{version}. I understand this confirmation records my consent for further processing.";

export function ProposalSignOff({
  proposalId,
  proposalVersion,
  signatures,
  canSign,
  userRole,
  onSignSuccess,
  proposalSummary,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: ProposalSignOffProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const signTerms = useMutation(api.negotiationProposals.signTerms);

  const isOpen = openProp ?? internalOpen;

  function setOpen(nextOpen: boolean) {
    onOpenChange?.(nextOpen);
    if (openProp === undefined) {
      setInternalOpen(nextOpen);
    }
  }

  const roleToCheck = userRole;
  const mySignature = roleToCheck
    ? signatures.find((signature) => signature.user_role === roleToCheck)
    : undefined;
  const tenantSignature = signatures.find((signature) => signature.user_role === "TENANT");
  const ownerSignature = signatures.find((signature) => signature.user_role === "OWNER");
  const bothSigned = Boolean(tenantSignature && ownerSignature);
  const awaitingRole = useMemo(() => {
    if (!tenantSignature) {
      return "tenant";
    }
    if (!ownerSignature) {
      return "owner";
    }
    return null;
  }, [ownerSignature, tenantSignature]);

  async function onConfirmSign() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await signTerms({
        proposal_id: proposalId,
        agreement_text: AGREEMENT_TEMPLATE.replace("{version}", String(proposalVersion)),
      });
      toast.success("Terms signed successfully");
      setOpen(false);
      onSignSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sign terms");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (bothSigned && tenantSignature && ownerSignature) {
    return (
      <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
          <Check className="size-4" />
          Terms Agreed
        </p>
        <p className="text-xs text-emerald-700">
          Tenant signed: {formatDateTime(tenantSignature.signed_at)}
        </p>
        <p className="text-xs text-emerald-700">
          Owner signed: {formatDateTime(ownerSignature.signed_at)}
        </p>
      </div>
    );
  }

  if (mySignature) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <p className="flex items-center gap-1.5 font-medium">
          <Check className="size-4" />
          You signed on {formatDateTime(mySignature.signed_at)}
        </p>
      </div>
    );
  }

  if (!canSign) {
    return awaitingRole ? (
      <p className="text-xs text-slate-500">Awaiting {awaitingRole} signature</p>
    ) : null;
  }

  return (
    <>
      {!hideTrigger ? (
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          Sign Terms
        </Button>
      ) : null}

      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="size-4 text-indigo-600" />
              Sign Proposal v{proposalVersion}
            </DialogTitle>
            <DialogDescription>
              Confirm your acceptance of the terms below. This action records your agreement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {proposalSummary ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Key Terms
                </p>
                <div className="grid grid-cols-1 gap-2 text-sm text-slate-800">
                  <p>
                    Monthly Rent:{" "}
                    <span className="font-semibold">
                      {formatINR(proposalSummary.monthly_rent_paise)}
                    </span>
                  </p>
                  <p>
                    Security Deposit:{" "}
                    <span className="font-semibold">
                      {formatINR(proposalSummary.security_deposit_paise)}
                    </span>
                  </p>
                  <p>
                    Token Advance:{" "}
                    <span className="font-semibold">
                      {formatINR(proposalSummary.token_advance_amount_paise)}
                    </span>
                  </p>
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs leading-relaxed text-amber-900">
                {AGREEMENT_TEMPLATE.replace("{version}", String(proposalVersion))}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                Role: {userRole ?? "Unknown"}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Proposal ID: {proposalId}
              </Badge>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={onConfirmSign} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing...
                </>
              ) : (
                "Confirm & Sign"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export type { ProposalSignOffProps };
