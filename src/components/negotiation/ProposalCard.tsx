"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  MAINTENANCE_PAID_BY,
  NEGOTIATION_PROPOSAL_STATUS_COLORS,
  NEGOTIATION_PROPOSAL_STATUS_LABELS,
  RENT_ESCALATION_TYPE,
} from "../../../lib/constants";
import { formatDate, formatDateTime } from "../../../lib/dates";
import { formatINR } from "../../../lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type ProposalCardData = {
  _id: Id<"negotiation_terms_proposals">;
  version: number;
  status: string;
  monthly_rent_paise: number;
  security_deposit_paise: number;
  security_deposit_months: number;
  lock_in_period_months: number;
  notice_period_months: number;
  move_in_date: number;
  maintenance_charges_paise: number;
  maintenance_paid_by: string;
  rent_escalation_type: string;
  rent_escalation_value: number;
  furnishing_terms: string;
  brokerage_tenant_side_paise: number;
  brokerage_owner_side_paise: number;
  token_advance_amount_paise: number;
  special_conditions?: string;
  created_at: number;
  shared_at?: number;
  is_locked: boolean;
};

export type ProposalSignatureStatus = {
  user_role: string;
  signed_at: number;
};

interface ProposalCardProps {
  proposal: ProposalCardData;
  signatures?: ProposalSignatureStatus[];
  onCounter?: (counterText: string) => void;
  onSign?: () => void;
  canCounter?: boolean;
  canSign?: boolean;
  compact?: boolean;
}

const maintenanceLabelMap: Record<string, string> = {
  [MAINTENANCE_PAID_BY.TENANT]: "Tenant",
  [MAINTENANCE_PAID_BY.OWNER]: "Owner",
  [MAINTENANCE_PAID_BY.SPLIT]: "Split",
};

function formatEscalation(type: string, value: number): string {
  if (type === RENT_ESCALATION_TYPE.NONE) {
    return "None";
  }

  if (type === RENT_ESCALATION_TYPE.PERCENTAGE) {
    return `${value}% annually`;
  }

  if (type === RENT_ESCALATION_TYPE.FIXED_AMOUNT) {
    return `${formatINR(Math.round(value))}/year`;
  }

  return "-";
}

function TermCell({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-3",
        highlight && "border-emerald-200 bg-emerald-50/40",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

export function ProposalCard({
  proposal,
  signatures = [],
  onCounter,
  onSign,
  canCounter = false,
  canSign = false,
  compact = false,
}: ProposalCardProps) {
  const [counterMode, setCounterMode] = useState(false);
  const [counterText, setCounterText] = useState("");

  const statusColor =
    NEGOTIATION_PROPOSAL_STATUS_COLORS[
      proposal.status as keyof typeof NEGOTIATION_PROPOSAL_STATUS_COLORS
    ] ?? "bg-slate-100 text-slate-700";
  const statusLabel =
    NEGOTIATION_PROPOSAL_STATUS_LABELS[
      proposal.status as keyof typeof NEGOTIATION_PROPOSAL_STATUS_LABELS
    ] ?? proposal.status;

  const signatureState = useMemo(() => {
    const tenantSignature = signatures.find((signature) => signature.user_role === "TENANT");
    const ownerSignature = signatures.find((signature) => signature.user_role === "OWNER");

    return {
      tenantSignature,
      ownerSignature,
      hasBoth: Boolean(tenantSignature && ownerSignature),
    };
  }, [signatures]);

  function submitCounter() {
    const trimmed = counterText.trim();
    if (!trimmed || !onCounter) {
      return;
    }
    onCounter(trimmed);
    setCounterText("");
    setCounterMode(false);
  }

  return (
    <Card className="w-full overflow-hidden border-slate-200 py-0">
      <CardHeader className="border-b border-slate-200 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-slate-900">
            Proposal v{proposal.version}
          </CardTitle>
          <Badge variant="secondary" className={cn("text-[11px] font-semibold", statusColor)}>
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-4 py-4 sm:px-5">
        {compact ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <TermCell label="Monthly Rent" value={formatINR(proposal.monthly_rent_paise)} />
            <TermCell
              label="Security Deposit"
              value={`${formatINR(proposal.security_deposit_paise)} (${proposal.security_deposit_months} months)`}
            />
            <TermCell label="Move-in Date" value={formatDate(proposal.move_in_date)} />
            <TermCell
              label="Token Advance"
              value={formatINR(proposal.token_advance_amount_paise)}
            />
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <TermCell label="Monthly Rent" value={formatINR(proposal.monthly_rent_paise)} />
              <TermCell
                label="Security Deposit"
                value={`${formatINR(proposal.security_deposit_paise)} (${proposal.security_deposit_months} months)`}
              />
              <TermCell label="Lock-in Period" value={`${proposal.lock_in_period_months} months`} />
              <TermCell label="Notice Period" value={`${proposal.notice_period_months} months`} />
              <TermCell label="Move-in Date" value={formatDate(proposal.move_in_date)} />
              <TermCell
                label="Maintenance"
                value={`${formatINR(proposal.maintenance_charges_paise)} (${maintenanceLabelMap[proposal.maintenance_paid_by] ?? proposal.maintenance_paid_by})`}
              />
              <TermCell
                label="Rent Escalation"
                value={formatEscalation(
                  proposal.rent_escalation_type,
                  proposal.rent_escalation_value,
                )}
              />
              <TermCell label="Furnishing" value={proposal.furnishing_terms} />
              <TermCell
                label="Brokerage (Tenant)"
                value={formatINR(proposal.brokerage_tenant_side_paise)}
              />
              <TermCell
                label="Brokerage (Owner)"
                value={formatINR(proposal.brokerage_owner_side_paise)}
              />
              <TermCell
                label="Token Advance"
                value={formatINR(proposal.token_advance_amount_paise)}
              />
              <TermCell
                label="Shared"
                value={proposal.shared_at ? formatDateTime(proposal.shared_at) : "Not shared"}
              />
            </div>

            {proposal.special_conditions && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Special Conditions
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                  {proposal.special_conditions}
                </p>
              </div>
            )}
          </>
        )}

        <Separator />

        <div className="space-y-1 text-xs text-slate-600">
          {signatureState.tenantSignature ? (
            <p className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-600" />
              Tenant signed ({formatDateTime(signatureState.tenantSignature.signed_at)})
            </p>
          ) : null}
          {signatureState.ownerSignature ? (
            <p className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-600" />
              Owner signed ({formatDateTime(signatureState.ownerSignature.signed_at)})
            </p>
          ) : null}
          {!signatureState.tenantSignature && !signatureState.ownerSignature ? (
            <p>Awaiting signatures</p>
          ) : null}
          {signatureState.hasBoth ? (
            <p className="font-medium text-emerald-700">Terms agreed</p>
          ) : null}
        </div>

        {(canCounter || canSign) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {canCounter && onCounter ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCounterMode((prev) => !prev)}
              >
                Counter
              </Button>
            ) : null}

            {canSign && onSign ? (
              <Button type="button" size="sm" onClick={onSign}>
                Sign Terms
              </Button>
            ) : null}
          </div>
        )}

        {counterMode && canCounter && onCounter ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium text-slate-700">Share your counter terms</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={counterText}
                onChange={(event) => setCounterText(event.target.value)}
                placeholder="Enter counter proposal details"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={counterText.trim().length === 0}
                  onClick={submitCounter}
                >
                  Send
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCounterMode(false);
                    setCounterText("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export type { ProposalCardProps };
