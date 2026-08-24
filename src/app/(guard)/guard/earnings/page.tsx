"use client";

import { useQuery } from "convex/react";
import { Banknote, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { api } from "../../../../../convex/_generated/api";
import { paiseToRupees } from "../../../../../lib/money";
import { GuardReferralSection } from "@/components/guard/guard-referral-section";
import { AttributionEarningsCard } from "@/components/shared/AttributionEarningsCard";
import { GamificationProfileCard } from "@/components/shared/GamificationProfileCard";
import { EarningsSummary } from "./components/earnings-summary";
import { PaidPayoutCard } from "./components/paid-payout-card";
import { PendingPayoutCard } from "./components/pending-payout-card";

const IST_TZ = "Asia/Kolkata";

function formatDateTime(
  ms: number | undefined,
  format: ReturnType<typeof useFormatter>,
  dateUnavailableLabel: string,
): string {
  if (ms === undefined) {
    return dateUnavailableLabel;
  }

  const date = new Date(ms);
  return `${format.dateTime(date, "short")}, ${format.dateTime(date, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: IST_TZ,
  })}`;
}

export default function GuardEarningsPage() {
  const t = useTranslations("guard.earnings");
  const tCommon = useTranslations("guard.common");
  const format = useFormatter();
  const earnings = useQuery(api.payouts.getGuardEarnings);

  const amountLabel = t("amount", { amount: "" }).replace("₹", "").trim();

  function formatLocation(buildingName: string | null, flatNumber: string | null): string {
    if (flatNumber) {
      return t("buildingFlat", {
        building: buildingName ?? tCommon("noData"),
        flat: flatNumber,
      });
    }

    return buildingName ?? tCommon("noData");
  }

  function formatCurrency(paise: number): string {
    return format.number(paiseToRupees(paise), "inr");
  }

  if (earnings === undefined) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-7 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Banknote className="size-5 text-slate-700" />
        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          {t("pendingPayouts")}
        </h2>
        {earnings.pending.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-base text-slate-500 shadow-sm">
            {t("noPending")}
          </p>
        ) : (
          <div className="space-y-3">
            {earnings.pending.map((payout) => (
              <PendingPayoutCard key={String(payout.payout_id)} payout={payout} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          {t("disbursedHistory")}
        </h2>
        {earnings.disbursed.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-base text-slate-500 shadow-sm">
            {t("noDisbursed")}
          </p>
        ) : (
          <div className="space-y-3">
            {earnings.disbursed.map((payout) => (
              <PaidPayoutCard key={String(payout.payout_id)} payout={payout} />
            ))}
          </div>
        )}
        <EarningsSummary totalEarnedPaise={earnings.total_earned} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          {t("failedPayouts")}
        </h2>
        {earnings.failed.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-base text-slate-500 shadow-sm">
            {t("noFailed")}
          </p>
        ) : (
          <div className="space-y-3">
            {earnings.failed.map((payout) => (
              <article
                key={String(payout.payout_id)}
                className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm"
              >
                <p className="text-base font-semibold text-slate-900">
                  {formatLocation(payout.building_name, payout.flat_number)}
                </p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {amountLabel}{" "}
                  {payout.amount_paise !== undefined
                    ? formatCurrency(payout.amount_paise)
                    : t("amountUnavailable")}
                </p>
                <p className="mt-1 text-base text-slate-600">
                  {t("updated")}: {formatDateTime(payout.created_at, format, t("dateUnavailable"))}
                </p>
                <p className="mt-2 rounded-lg bg-amber-100/70 px-3 py-2 text-base text-amber-900">
                  {t("reason")}:{" "}
                  {payout.failure_reason?.trim() ? payout.failure_reason : t("defaultReason")}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <AttributionEarningsCard />

      <GamificationProfileCard />

      <GuardReferralSection />
    </div>
  );
}
