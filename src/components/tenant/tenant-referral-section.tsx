"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import {
  REFERRAL_MILESTONE_STATUS,
  REFERRAL_MILESTONE_TYPE,
  REFERRAL_TYPE,
  USER_TYPE,
} from "../../../lib/constants";
import { ReferralDashboard } from "@/components/shared/referral-dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function getOrigin(): string {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  return window.location.origin;
}

export function TenantReferralSection() {
  const [isGenerating, setIsGenerating] = useState(false);

  const currentUser = useQuery(api.users.getCurrentUser);
  const referralCode = useQuery(api.referralCodes.getByUser);
  const referralData = useQuery(api.referrals.listByReferrer, {
    referral_type: REFERRAL_TYPE.TENANT_FINDING,
  });
  const earningsSummary = useQuery(
    api.referralMilestones.getEarningsSummary,
    currentUser?._id ? { user_id: currentUser._id } : "skip",
  );

  const generateCode = useMutation(api.referralCodes.generate);
  const trackShare = useMutation(api.referrals.trackTenantReferralShare);

  const codeInfo = useMemo(() => {
    if (!referralCode) {
      return null;
    }

    return {
      code: referralCode.code,
      share_url: `${getOrigin()}/ref/${referralCode.code}`,
    };
  }, [referralCode]);

  if (
    currentUser === undefined ||
    referralCode === undefined ||
    referralData === undefined ||
    earningsSummary === undefined
  ) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </section>
    );
  }

  if (!currentUser || currentUser.user_type !== USER_TYPE.TENANT) {
    return (
      <Card className="border-dashed border-cyan-300 bg-white shadow-sm">
        <CardContent className="py-4 text-sm text-slate-600">
          Tenant referral access is only available for tenant accounts.
        </CardContent>
      </Card>
    );
  }

  const incomingMilestone = referralData.referredBy?.milestones.find(
    (milestone) => milestone.milestone_type === REFERRAL_MILESTONE_TYPE.SIGN_UP,
  );

  async function handleGenerateCode() {
    setIsGenerating(true);

    try {
      await generateCode();
      toast.success("Referral code created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create referral code");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleShareSuccess(method: "COPY_LINK" | "WEB_SHARE") {
    void trackShare({
      method,
      referral_code: codeInfo?.code,
    }).catch(() => {});
  }

  return (
    <section className="space-y-3">
      {!codeInfo ? (
        <Card className="border-dashed border-cyan-300 bg-white shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 size-4 text-cyan-600" />
              <div>
                <p className="text-sm font-semibold text-slate-900">No referral code yet</p>
                <p className="text-xs text-slate-600">
                  Generate your tenant referral code to start sharing and earning bonuses.
                </p>
              </div>
            </div>
            <Button
              type="button"
              className="w-full bg-cyan-600 text-white hover:bg-cyan-700"
              disabled={isGenerating}
              onClick={() => void handleGenerateCode()}
            >
              {isGenerating ? <Loader2 className="size-4 animate-spin" /> : null}
              Generate Referral Code
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <ReferralDashboard
        userType={USER_TYPE.TENANT}
        referralData={{
          incoming: referralData.referredBy
            ? {
                label: `Referred by ${referralData.referredBy.referrer_name}`,
                status: referralData.referredBy.status,
                bonus_amount_paise:
                  incomingMilestone?.amount ??
                  referralData.referredBy.milestone_summary.total_amount,
                milestone_status: incomingMilestone?.status ?? REFERRAL_MILESTONE_STATUS.PENDING,
              }
            : null,
          outgoing: referralData.referredGuards.map((referral, index) => ({
            id: String(referral._id),
            label: `User #${index + 1}`,
            referral_type: referral.referral_type,
            status: referral.status,
            total_amount_paise: referral.milestone_summary.total_amount,
            paid_amount_paise: referral.milestone_summary.paid_amount,
          })),
        }}
        milestones={earningsSummary}
        codeInfo={codeInfo}
        title="Tenant Referrals"
        emptyStateLabel={
          codeInfo
            ? "No referrals yet. Share your code to invite tenants."
            : "Generate a referral code to begin sharing."
        }
        onShareSuccessAction={handleShareSuccess}
      />
    </section>
  );
}
