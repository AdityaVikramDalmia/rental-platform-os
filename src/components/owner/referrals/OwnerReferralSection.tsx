"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Loader2, MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import {
  REFERRAL_MILESTONE_STATUS,
  REFERRAL_MILESTONE_TYPE,
  REFERRAL_TYPE,
  USER_TYPE,
} from "../../../../lib/constants";
import { ReferralDashboard } from "@/components/shared/referral-dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function getOrigin(): string {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  return window.location.origin;
}

export function OwnerReferralSection() {
  const [isGenerating, setIsGenerating] = useState(false);
  const referralCode = useQuery(api.referralCodes.getByUser);
  const referralData = useQuery(api.referrals.listByReferrer, {
    referral_type: REFERRAL_TYPE.OWNER_FINDING,
  });
  const generateCode = useMutation(api.referralCodes.generate);

  const codeInfo = useMemo(() => {
    if (!referralCode) {
      return null;
    }

    return {
      code: referralCode.code,
      share_url: `${getOrigin()}/ref/${referralCode.code}`,
    };
  }, [referralCode]);

  if (referralData === undefined || referralCode === undefined) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </section>
    );
  }

  const referredByMilestones = referralData.referredBy?.milestones ?? [];
  const outgoingMilestones = referralData.referredGuards.flatMap((referral) => referral.milestones);
  const allMilestones = [...referredByMilestones, ...outgoingMilestones];
  const paidMilestones = allMilestones.filter(
    (milestone) => milestone.status === REFERRAL_MILESTONE_STATUS.PAID,
  );

  const milestoneTotals = paidMilestones.reduce(
    (totals, milestone) => {
      if (milestone.milestone_type === REFERRAL_MILESTONE_TYPE.SIGN_UP) {
        totals.sign_up_bonus_paid_paise += milestone.amount;
      }

      if (milestone.milestone_type === REFERRAL_MILESTONE_TYPE.LISTING_PUBLISHED) {
        totals.listing_bonus_paid_paise += milestone.amount;
      }

      if (milestone.milestone_type === REFERRAL_MILESTONE_TYPE.DEAL_CLOSED) {
        totals.closure_bonus_paid_paise += milestone.amount;
      }

      if (milestone.milestone_type === REFERRAL_MILESTONE_TYPE.FIRST_VERIFIED_LEAD) {
        totals.first_verified_lead_bonus_paid_paise += milestone.amount;
      }

      totals.total_earned_paid_paise += milestone.amount;
      return totals;
    },
    {
      sign_up_bonus_paid_paise: 0,
      listing_bonus_paid_paise: 0,
      closure_bonus_paid_paise: 0,
      first_verified_lead_bonus_paid_paise: 0,
      total_earned_paid_paise: 0,
    },
  );

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

  async function handleCopyCode() {
    if (!codeInfo) {
      return;
    }

    try {
      await navigator.clipboard.writeText(codeInfo.code);
      toast.success("Referral code copied");
    } catch {
      toast.error("Unable to copy referral code");
    }
  }

  async function handleShareWhatsApp() {
    if (!codeInfo) {
      return;
    }

    const shareText = `Use my DemoRentals referral code ${codeInfo.code}: ${codeInfo.share_url}`;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Share referral code",
          text: shareText,
          url: codeInfo.share_url,
        });
      } catch {
        return;
      }

      return;
    }

    if (typeof window !== "undefined") {
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noreferrer");
      return;
    }

    toast.error("Sharing is not supported on this device");
  }

  return (
    <section className="space-y-3">
      {codeInfo ? (
        <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-indigo-900">Owner Sharing Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => void handleCopyCode()}
            >
              <Copy className="size-4" />
              Copy Code
            </Button>
            <Button
              type="button"
              className="flex-1 bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => void handleShareWhatsApp()}
            >
              <MessageCircle className="size-4" />
              Share on WhatsApp
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-indigo-300 bg-white shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 size-4 text-indigo-600" />
              <div>
                <p className="text-sm font-semibold text-slate-900">No referral code yet</p>
                <p className="text-xs text-slate-600">
                  Generate your owner referral code to start sharing and earning bonuses.
                </p>
              </div>
            </div>
            <Button
              type="button"
              className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
              disabled={isGenerating}
              onClick={() => void handleGenerateCode()}
            >
              {isGenerating ? <Loader2 className="size-4 animate-spin" /> : null}
              Generate Referral Code
            </Button>
          </CardContent>
        </Card>
      )}

      <ReferralDashboard
        userType={USER_TYPE.OWNER}
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
        milestones={milestoneTotals}
        codeInfo={codeInfo}
        title="Owner Referrals"
        emptyStateLabel={
          codeInfo
            ? "No referrals yet. Share your code to invite owners."
            : "Generate a referral code to begin sharing."
        }
      />
    </section>
  );
}
