"use client";

import { useMutation } from "convex/react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  TOKEN_REFUND_POLICY,
  TOKEN_RECORD_STATUS,
  TOKEN_RECORD_STATUS_COLORS,
  TOKEN_RECORD_STATUS_LABELS,
} from "../../../lib/constants";
import { formatDateTime } from "../../../lib/dates";
import { formatINR } from "../../../lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { TokenRecordData } from "./TokenCollection";

interface TenantPolicyAgreementProps {
  negotiationId: Id<"negotiations">;
  tokenAmountPaise: number;
  tokenRecord: TokenRecordData | null;
  onSuccess?: () => void;
}

function getRefundPolicyLabel(policy: TokenRecordData["refund_policy"]): string {
  switch (policy) {
    case TOKEN_REFUND_POLICY.NON_REFUNDABLE:
      return "Non-refundable";
    case TOKEN_REFUND_POLICY.REFUNDABLE_WITHIN_DAYS:
      return "Refundable within fixed days";
    case TOKEN_REFUND_POLICY.PARTIAL_REFUND:
      return "Partial refund";
    case TOKEN_REFUND_POLICY.CASE_BY_CASE:
      return "Case-by-case";
    default:
      return policy;
  }
}

function getRefundPolicyDescription(record: TokenRecordData): string {
  switch (record.refund_policy) {
    case TOKEN_REFUND_POLICY.NON_REFUNDABLE:
      return "This token is non-refundable once collected.";
    case TOKEN_REFUND_POLICY.REFUNDABLE_WITHIN_DAYS:
      return record.refund_days
        ? `Full refund is allowed within ${record.refund_days} day(s) from collection.`
        : "Full refund is allowed only within the configured refund window.";
    case TOKEN_REFUND_POLICY.PARTIAL_REFUND:
      return record.refund_percentage !== undefined
        ? `${record.refund_percentage}% of the token amount is refundable under agreed conditions.`
        : "A partial token refund is applicable per agreed conditions.";
    case TOKEN_REFUND_POLICY.CASE_BY_CASE:
      return "Refund outcome is decided case-by-case by Ops based on deal context.";
    default:
      return "Refund policy details are recorded in this negotiation.";
  }
}

export function TenantPolicyAgreement({
  negotiationId,
  tokenAmountPaise,
  tokenRecord,
  onSuccess,
}: TenantPolicyAgreementProps) {
  const [hasAgreed, setHasAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const agreeToPolicy = useMutation(api.negotiationTokens.tenantAgreeToPolicy);

  async function handleAgree() {
    setIsSubmitting(true);
    try {
      await agreeToPolicy({ negotiation_id: negotiationId });
      toast.success("Token policy agreement recorded");
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record agreement");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (tokenRecord?.status === TOKEN_RECORD_STATUS.COLLECTED) {
    return (
      <Card className="border-emerald-200 bg-emerald-50 py-0">
        <CardHeader className="px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 className="size-4" />
            Token Collected
          </CardTitle>
          <CardDescription className="text-emerald-700">
            Token of {formatINR(tokenRecord.amount_paise)} collected on{" "}
            {formatDateTime(tokenRecord.collected_at)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 px-4 pb-4 text-sm text-emerald-800">
          <p>
            Refund Policy:{" "}
            <span className="font-semibold">{getRefundPolicyLabel(tokenRecord.refund_policy)}</span>
          </p>
          {tokenRecord.refund_days ? <p>Refund Window: {tokenRecord.refund_days} day(s)</p> : null}
          {tokenRecord.refund_percentage !== undefined ? (
            <p>Refund Percentage: {tokenRecord.refund_percentage}%</p>
          ) : null}
          <p className="text-xs text-emerald-700">{getRefundPolicyDescription(tokenRecord)}</p>
        </CardContent>
      </Card>
    );
  }

  if (tokenRecord) {
    return (
      <Card className="border-slate-200 py-0">
        <CardHeader className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-900">
              <CheckCircle2 className="size-4 text-emerald-600" />
              Policy Agreement Recorded
            </CardTitle>
            <Badge
              variant="secondary"
              className={cn(
                "text-[11px] font-semibold",
                TOKEN_RECORD_STATUS_COLORS[tokenRecord.status],
              )}
            >
              {TOKEN_RECORD_STATUS_LABELS[tokenRecord.status]}
            </Badge>
          </div>
          <CardDescription>
            You agreed to the token policy on {formatDateTime(tokenRecord.tenant_agreed_at)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 text-sm text-slate-700">
          <div className="space-y-1.5">
            <p>
              Amount:{" "}
              <span className="font-semibold text-slate-900">
                {formatINR(tokenRecord.amount_paise)}
              </span>
            </p>
            <p>
              Refund Policy:{" "}
              <span className="font-medium text-slate-900">
                {getRefundPolicyLabel(tokenRecord.refund_policy)}
              </span>
            </p>
            {tokenRecord.refund_days ? (
              <p>Refund Window: {tokenRecord.refund_days} day(s)</p>
            ) : null}
            {tokenRecord.refund_percentage !== undefined ? (
              <p>Refund Percentage: {tokenRecord.refund_percentage}%</p>
            ) : null}
            <p className="text-xs text-slate-600">{getRefundPolicyDescription(tokenRecord)}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 py-0">
      <CardHeader className="px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm text-slate-900">
          <ShieldCheck className="size-4 text-indigo-600" />
          Token Policy Agreement
        </CardTitle>
        <CardDescription>
          Please review and confirm token advance refund terms before collection.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p>
            Token Amount:{" "}
            <span className="font-semibold text-slate-900">{formatINR(tokenAmountPaise)}</span>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            This token advance is recorded as part of your finalized deal terms. Refundability
            depends on the policy shared by Ops for this negotiation.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-slate-200 p-3">
          <Checkbox
            id="token-policy-agreement"
            checked={hasAgreed}
            onCheckedChange={(checked) => setHasAgreed(checked === true)}
            className="mt-0.5"
          />
          <label htmlFor="token-policy-agreement" className="cursor-pointer text-sm text-slate-700">
            I understand and agree to the token advance terms.
          </label>
        </div>

        <Button type="button" disabled={!hasAgreed || isSubmitting} onClick={handleAgree}>
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Agree & Proceed"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export type { TenantPolicyAgreementProps };
