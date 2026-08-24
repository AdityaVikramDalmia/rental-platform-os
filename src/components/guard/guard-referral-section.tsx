"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "../../../convex/_generated/api";
import {
  REFERRAL_TYPE,
  REFERRAL_MILESTONE_STATUS,
  REFERRAL_MILESTONE_TYPE,
  USER_TYPE,
} from "../../../lib/constants";
import { ReferralDashboard } from "@/components/shared/referral-dashboard";
import { Skeleton } from "@/components/ui/skeleton";

export function GuardReferralSection() {
  const t = useTranslations("guard.referrals");
  const referralData = useQuery(api.referrals.listByReferrer, {
    referral_type: REFERRAL_TYPE.GUARD,
  });

  if (referralData === undefined) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("title")}</h2>
        <Skeleton className="h-28 rounded-xl" />
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
    (milestone) => milestone.milestone_type === REFERRAL_MILESTONE_TYPE.FIRST_VERIFIED_LEAD,
  );

  return (
    <ReferralDashboard
      userType={USER_TYPE.GUARD}
      referralData={{
        incoming: referralData.referredBy
          ? {
              label: `${t("referredBy")} ${referralData.referredBy.referrer_name}`,
              status: referralData.referredBy.status,
              bonus_amount_paise:
                incomingMilestone?.amount ?? referralData.referredBy.milestone_summary.total_amount,
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
      codeInfo={null}
      title={t("title")}
      emptyStateLabel={t("noReferrals")}
    />
  );
}
