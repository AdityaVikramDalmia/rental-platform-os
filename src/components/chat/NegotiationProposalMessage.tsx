"use client";

import { useQuery } from "convex/react";
import { FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { NEGOTIATION_PROPOSAL_STATUS, USER_TYPE } from "../../../lib/constants";
import { BrokerageDisplay } from "@/components/negotiation/BrokerageDisplay";
import { ProposalCard } from "@/components/negotiation/ProposalCard";
import { ProposalSignOff } from "@/components/negotiation/ProposalSignOff";
import { TenantPolicyAgreement } from "@/components/negotiation/TenantPolicyAgreement";
import { TokenCollection } from "@/components/negotiation/TokenCollection";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface NegotiationProposalMessageProps {
  proposalId: Id<"negotiation_terms_proposals">;
  negotiationId: Id<"negotiations">;
  channelType?: string;
  currentUserRole?: string;
  canSign?: boolean;
  canCounter?: boolean;
  onCounter?: (text: string) => void;
  className?: string;
}

export function NegotiationProposalMessage({
  proposalId,
  negotiationId,
  currentUserRole,
  canSign,
  canCounter,
  onCounter,
  className,
}: NegotiationProposalMessageProps) {
  const [showSignDialog, setShowSignDialog] = useState(false);
  const isBackofficeUser = currentUserRole === USER_TYPE.ADMIN || currentUserRole === USER_TYPE.OPS;

  const referencedProposal = useQuery(
    api.negotiationProposals.getById,
    isBackofficeUser ? { proposal_id: proposalId } : "skip",
  );
  const activeProposal = useQuery(api.negotiationProposals.getActiveProposal, {
    negotiation_id: negotiationId,
  });
  const tokenRecord = useQuery(api.negotiationTokens.getForNegotiation, {
    negotiation_id: negotiationId,
  });

  const userRole = useMemo(() => {
    if (currentUserRole === USER_TYPE.TENANT) {
      return "TENANT" as const;
    }
    if (currentUserRole === USER_TYPE.OWNER) {
      return "OWNER" as const;
    }
    return undefined;
  }, [currentUserRole]);

  const isProposalLoading = isBackofficeUser
    ? referencedProposal === undefined
    : activeProposal === undefined;

  if (isProposalLoading) {
    return (
      <Card className={cn("w-full max-w-2xl border-slate-200 py-0", className)}>
        <CardContent className="space-y-3 px-4 py-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const proposal = isBackofficeUser ? referencedProposal : activeProposal?.proposal;
  const isActiveProposal = activeProposal?.proposal._id === proposalId;

  if (!proposal || (!isBackofficeUser && !isActiveProposal)) {
    return (
      <Card className={cn("w-full max-w-2xl border-slate-200 py-0", className)}>
        <CardContent className="px-4 py-3">
          <p className="text-sm text-slate-600">
            This proposal is unavailable or no longer accessible.
          </p>
        </CardContent>
      </Card>
    );
  }

  const signatures: Array<{ user_role: string; signed_at: number; agreement_text: string }> =
    isActiveProposal && activeProposal ? activeProposal.signatures : [];

  const hasSignedCurrentUser = userRole
    ? signatures.some((signature: { user_role: string }) => signature.user_role === userRole)
    : false;
  const bothSigned =
    signatures.some((signature: { user_role: string }) => signature.user_role === "TENANT") &&
    signatures.some((signature: { user_role: string }) => signature.user_role === "OWNER");

  const resolvedCanSign =
    canSign ??
    Boolean(
      isActiveProposal &&
      userRole &&
      proposal.status === "SHARED" &&
      !hasSignedCurrentUser &&
      !bothSigned,
    );

  const resolvedCanCounter =
    canCounter ??
    Boolean(isActiveProposal && userRole && proposal.status === "SHARED" && !bothSigned);

  const isTenantUser = currentUserRole === USER_TYPE.TENANT;
  const shouldRenderTokenFlow =
    proposal.status === NEGOTIATION_PROPOSAL_STATUS.BOTH_AGREED || tokenRecord !== null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <FileText className="size-3.5" />
        New terms proposal (v{proposal.version}) shared
      </div>

      <ProposalCard
        proposal={proposal}
        signatures={signatures}
        compact
        canSign={resolvedCanSign}
        canCounter={resolvedCanCounter && Boolean(onCounter)}
        onSign={() => setShowSignDialog(true)}
        onCounter={onCounter}
      />

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <BrokerageDisplay
          tenantBrokeragePaise={proposal.brokerage_tenant_side_paise}
          ownerBrokeragePaise={proposal.brokerage_owner_side_paise}
          compact
        />
      </div>

      <ProposalSignOff
        proposalId={proposal._id}
        proposalVersion={proposal.version}
        signatures={signatures}
        canSign={resolvedCanSign}
        userRole={userRole}
        proposalSummary={{
          monthly_rent_paise: proposal.monthly_rent_paise,
          security_deposit_paise: proposal.security_deposit_paise,
          token_advance_amount_paise: proposal.token_advance_amount_paise,
        }}
        open={showSignDialog}
        onOpenChange={setShowSignDialog}
        hideTrigger
        onSignSuccess={() => setShowSignDialog(false)}
      />

      {shouldRenderTokenFlow && tokenRecord === undefined ? (
        <Card className="border-slate-200 py-0">
          <CardContent className="space-y-2 px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : null}

      {shouldRenderTokenFlow && tokenRecord !== undefined && isBackofficeUser ? (
        <TokenCollection
          negotiationId={negotiationId}
          tokenRecord={tokenRecord}
          proposalAmount={proposal.token_advance_amount_paise}
        />
      ) : null}

      {shouldRenderTokenFlow && tokenRecord !== undefined && isTenantUser ? (
        <TenantPolicyAgreement
          negotiationId={negotiationId}
          tokenAmountPaise={proposal.token_advance_amount_paise}
          tokenRecord={tokenRecord}
        />
      ) : null}
    </div>
  );
}

export type { NegotiationProposalMessageProps };
