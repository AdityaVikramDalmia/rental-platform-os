"use client";

import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { BrokerageDisplay } from "@/components/negotiation/BrokerageDisplay";
import { MandatoryChecklist } from "@/components/negotiation/MandatoryChecklist";
import { ProposalCard } from "@/components/negotiation/ProposalCard";
import { ProposalSignOff } from "@/components/negotiation/ProposalSignOff";
import { TokenCollection, type TokenRecordData } from "@/components/negotiation/TokenCollection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ProposalHistoryEntry = {
  proposal: {
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
  signatures: Array<{
    user_role: string;
    signed_at: number;
    agreement_text: string;
  }>;
};

type NegotiationSidebarProps = {
  negotiationId: Id<"negotiations">;
  activeProposal: ProposalHistoryEntry | null | undefined;
  proposalHistory: ProposalHistoryEntry[] | undefined;
  tokenRecord: TokenRecordData | null | undefined;
  canManage: boolean;
  isAdmin: boolean;
  onClosureReady?: () => void;
};

export function NegotiationSidebar({
  negotiationId,
  activeProposal,
  proposalHistory,
  tokenRecord,
  canManage,
  isAdmin,
  onClosureReady,
}: NegotiationSidebarProps) {
  const proposalAmount = activeProposal?.proposal.token_advance_amount_paise;

  return (
    <div className="space-y-4">
      <MandatoryChecklist
        negotiationId={negotiationId}
        canManage={canManage}
        isAdmin={isAdmin}
        onClosureReady={onClosureReady}
      />

      <Card className="border-slate-200 py-0">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm font-semibold text-slate-900">Active Proposal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          {activeProposal === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : activeProposal ? (
            <>
              <ProposalCard
                proposal={activeProposal.proposal}
                signatures={activeProposal.signatures}
                compact
              />
              <ProposalSignOff
                proposalId={activeProposal.proposal._id}
                proposalVersion={activeProposal.proposal.version}
                signatures={activeProposal.signatures}
                canSign={false}
                hideTrigger
              />
            </>
          ) : (
            <p className="text-sm text-slate-500">No active proposal yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 py-0">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm font-semibold text-slate-900">Proposal History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          {proposalHistory === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : proposalHistory.length === 0 ? (
            <p className="text-sm text-slate-500">No proposals created yet.</p>
          ) : (
            proposalHistory.map((entry) => (
              <ProposalCard
                key={entry.proposal._id}
                proposal={entry.proposal}
                signatures={entry.signatures}
                compact
              />
            ))
          )}
        </CardContent>
      </Card>

      {activeProposal ? (
        <BrokerageDisplay
          tenantBrokeragePaise={activeProposal.proposal.brokerage_tenant_side_paise}
          ownerBrokeragePaise={activeProposal.proposal.brokerage_owner_side_paise}
        />
      ) : null}

      {tokenRecord === undefined ? (
        <Card className="border-slate-200 py-0">
          <CardContent className="space-y-2 px-4 py-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ) : (
        <TokenCollection
          negotiationId={negotiationId}
          tokenRecord={tokenRecord}
          proposalAmount={proposalAmount}
          canManage={canManage}
        />
      )}
    </div>
  );
}
