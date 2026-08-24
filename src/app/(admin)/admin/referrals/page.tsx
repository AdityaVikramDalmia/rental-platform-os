"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import { Loader2, Settings2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  PERMISSIONS,
  REFERRAL_STATUS,
  REFERRAL_STATUS_LABELS,
  REFERRAL_TYPE,
  REFERRAL_TYPE_LABELS,
  type ReferralStatus,
  type ReferralType,
} from "../../../../../lib/constants";
import { ReferralDetailPanel } from "@/components/admin/referral-detail-panel";
import { ReferralTable } from "@/components/admin/referral-table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ReferralTypeFilter = ReferralType | "ALL";
type ReferralStatusFilter = ReferralStatus | "ALL";

export default function ReferralsPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );

  const permissionSet = useMemo(() => {
    const permissions = new Set<string>();
    if (!roleAssignments) {
      return permissions;
    }

    for (const assignment of roleAssignments) {
      for (const permission of assignment.role.permissions) {
        permissions.add(permission);
      }
    }

    return permissions;
  }, [roleAssignments]);

  const hasReferralsView = permissionSet.has(PERMISSIONS.REFERRALS_VIEW);
  const hasReferralsConfigure = permissionSet.has(PERMISSIONS.REFERRALS_CONFIGURE);
  const hasReferralsManage = permissionSet.has(PERMISSIONS.REFERRALS_MANAGE);
  const hasReferralsApprovePayout = permissionSet.has(PERMISSIONS.REFERRALS_APPROVE_PAYOUT);

  if (currentUser === undefined || roleAssignments === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) {
    return null;
  }

  if (!hasReferralsView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view referrals.
      </div>
    );
  }

  return (
    <ReferralsContent
      hasReferralsConfigure={hasReferralsConfigure}
      hasReferralsManage={hasReferralsManage}
      hasReferralsApprovePayout={hasReferralsApprovePayout}
    />
  );
}

type ReferralsContentProps = {
  hasReferralsConfigure: boolean;
  hasReferralsManage: boolean;
  hasReferralsApprovePayout: boolean;
};

function ReferralsContent({
  hasReferralsConfigure,
  hasReferralsManage,
  hasReferralsApprovePayout,
}: ReferralsContentProps) {
  const [typeFilter, setTypeFilter] = useState<ReferralTypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<ReferralStatusFilter>("ALL");
  const [selectedReferralId, setSelectedReferralId] = useState<Id<"referrals"> | null>(null);

  const queryArgs = useMemo(
    () => ({
      referral_type: typeFilter === "ALL" ? undefined : typeFilter,
      status: statusFilter === "ALL" ? undefined : statusFilter,
    }),
    [statusFilter, typeFilter],
  );

  const { results, status, loadMore } = usePaginatedQuery(api.referrals.listAll, queryArgs, {
    initialNumItems: 20,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Referrals</h2>
          <p className="text-sm text-slate-600">
            Review referral attributions, milestone payouts, and exceptions.
          </p>
          <p className="text-xs text-slate-500">
            Guard referral is GUARD-only. OPS field workers are excluded from guard referral
            attribution; tenant/owner referral programs are unchanged.
          </p>
        </div>

        {hasReferralsConfigure ? (
          <Button asChild type="button" variant="outline" className="gap-1.5">
            <Link href="/admin/settings/referrals">
              <Settings2 className="size-4" />
              Referral Config
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={typeFilter}
          onValueChange={(value) => {
            setTypeFilter(value as ReferralTypeFilter);
            setSelectedReferralId(null);
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            {Object.values(REFERRAL_TYPE).map((referralType) => (
              <SelectItem key={referralType} value={referralType}>
                {REFERRAL_TYPE_LABELS[referralType]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as ReferralStatusFilter);
            setSelectedReferralId(null);
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            {Object.values(REFERRAL_STATUS).map((referralStatus) => (
              <SelectItem key={referralStatus} value={referralStatus}>
                {REFERRAL_STATUS_LABELS[referralStatus]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ReferralTable
        referrals={results}
        status={status}
        selectedReferralId={selectedReferralId}
        selectReferralAction={setSelectedReferralId}
        loadMoreAction={() => loadMore(20)}
      />

      <ReferralDetailPanel
        referralId={selectedReferralId}
        closeAction={() => setSelectedReferralId(null)}
        hasReferralsManage={hasReferralsManage}
        hasReferralsApprovePayout={hasReferralsApprovePayout}
      />
    </div>
  );
}
