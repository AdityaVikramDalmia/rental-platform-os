"use client";

import { useMemo } from "react";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  REFERRAL_STATUS_COLORS,
  REFERRAL_STATUS_LABELS,
  USER_TYPE,
  type ReferralMilestoneStatus,
  type ReferralStatus,
  type ReferralType,
  type UserType,
} from "../../../lib/constants";
import { formatINR } from "../../../lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type IncomingReferral = {
  label: string;
  status: ReferralStatus;
  bonus_amount_paise: number;
  milestone_status: ReferralMilestoneStatus;
};

type OutgoingReferral = {
  id: string;
  label: string;
  referral_type: ReferralType;
  status: ReferralStatus;
  total_amount_paise: number;
  paid_amount_paise: number;
};

type ReferralDashboardData = {
  incoming: IncomingReferral | null;
  outgoing: OutgoingReferral[];
};

type ReferralDashboardMilestones = {
  sign_up_bonus_paid_paise: number;
  listing_bonus_paid_paise: number;
  closure_bonus_paid_paise: number;
  first_verified_lead_bonus_paid_paise: number;
  total_earned_paid_paise: number;
};

type ReferralCodeInfo = {
  code: string;
  share_url: string;
} | null;

type ReferralDashboardProps = {
  userType: UserType;
  referralData: ReferralDashboardData;
  milestones: ReferralDashboardMilestones;
  codeInfo: ReferralCodeInfo;
  title?: string;
  emptyStateLabel?: string;
  onShareSuccessAction?: (method: "COPY_LINK" | "WEB_SHARE") => void;
};

export function ReferralDashboard({
  userType,
  referralData,
  milestones,
  codeInfo,
  title = "Referrals",
  emptyStateLabel = "No referrals yet.",
  onShareSuccessAction,
}: ReferralDashboardProps) {
  const canShowShareActions = useMemo(
    () => userType === USER_TYPE.TENANT || userType === USER_TYPE.OWNER,
    [userType],
  );
  const canUseWebShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const hasAnyData = Boolean(referralData.incoming) || referralData.outgoing.length > 0;

  async function handleCopyLink() {
    if (!codeInfo) {
      return;
    }

    try {
      await navigator.clipboard.writeText(codeInfo.share_url);
      toast.success("Referral link copied");
      onShareSuccessAction?.("COPY_LINK");
    } catch {
      toast.error("Unable to copy referral link");
    }
  }

  async function handleShare() {
    if (!codeInfo) {
      return;
    }

    if (!canUseWebShare) {
      toast.error("Sharing is not supported on this device");
      return;
    }

    try {
      await navigator.share({
        title: "Join via my DemoRentals referral",
        text: `Use my referral code ${codeInfo.code}`,
        url: codeInfo.share_url,
      });
      onShareSuccessAction?.("WEB_SHARE");
    } catch {
      return;
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>

      {codeInfo && canShowShareActions ? (
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-900">Your Referral Code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <p className="font-semibold text-slate-900">{codeInfo.code}</p>
              <p className="mt-1 break-all text-xs text-slate-600">{codeInfo.share_url}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCopyLink()}
              >
                <Copy className="size-4" />
                Copy Link
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleShare()}
                disabled={!canUseWebShare}
              >
                <Share2 className="size-4" />
                Share
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-1 py-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Sign-up Bonus Earned</p>
            <p className="text-lg font-semibold text-slate-900">
              {formatINR(milestones.sign_up_bonus_paid_paise)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-1 py-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Listing Bonus Earned</p>
            <p className="text-lg font-semibold text-slate-900">
              {formatINR(milestones.listing_bonus_paid_paise)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-1 py-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Closure Bonus Earned</p>
            <p className="text-lg font-semibold text-slate-900">
              {formatINR(milestones.closure_bonus_paid_paise)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-1 py-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Earned</p>
            <p className="text-lg font-semibold text-slate-900">
              {formatINR(milestones.total_earned_paid_paise)}
            </p>
          </CardContent>
        </Card>
      </div>

      {referralData.incoming ? (
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-900">Referred By</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-medium text-slate-900">{referralData.incoming.label}</p>
            <div className="flex items-center justify-between gap-2 text-slate-600">
              <span>Bonus Amount</span>
              <span className="font-semibold text-slate-900">
                {formatINR(referralData.incoming.bonus_amount_paise)}
              </span>
            </div>
            <Badge className={cn(REFERRAL_STATUS_COLORS[referralData.incoming.status])}>
              {REFERRAL_STATUS_LABELS[referralData.incoming.status]}
            </Badge>
          </CardContent>
        </Card>
      ) : null}

      {referralData.outgoing.length > 0 ? (
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-slate-900">People Referred</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {referralData.outgoing.map((referral) => (
              <div
                key={referral.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-slate-900">{referral.label}</p>
                  <p className="text-xs text-slate-500">
                    {referral.referral_type.replaceAll("_", " ")}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-medium text-slate-900">
                    {formatINR(referral.paid_amount_paise)} paid
                  </p>
                  <p className="text-slate-500">{formatINR(referral.total_amount_paise)} total</p>
                  <Badge className={cn(REFERRAL_STATUS_COLORS[referral.status])}>
                    {REFERRAL_STATUS_LABELS[referral.status]}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {!hasAnyData ? (
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardContent className="py-4 text-base text-slate-500">{emptyStateLabel}</CardContent>
        </Card>
      ) : null}

      {milestones.first_verified_lead_bonus_paid_paise > 0 ? (
        <p className="text-xs text-slate-500">
          First verified lead bonus earned:{" "}
          {formatINR(milestones.first_verified_lead_bonus_paid_paise)}
        </p>
      ) : null}
    </section>
  );
}
