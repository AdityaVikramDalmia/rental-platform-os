"use client";

import type { FunctionReturnType } from "convex/server";
import { useFormatter, useTranslations } from "next-intl";
import type { api } from "../../../../../../convex/_generated/api";
import { PAYOUT_STATUS } from "../../../../../../lib/constants";
import { paiseToRupees } from "../../../../../../lib/money";

const IST_TZ = "Asia/Kolkata";

type GuardEarnings = FunctionReturnType<typeof api.payouts.getGuardEarnings>;
type PendingPayout = GuardEarnings["pending"][number];

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

function getStatusLabel(
  status: PendingPayout["status"],
  t: ReturnType<typeof useTranslations>,
): string {
  if (status === PAYOUT_STATUS.APPROVED) {
    return t("approvedSoon");
  }

  return t("processing");
}

export function PendingPayoutCard({ payout }: { payout: PendingPayout }) {
  const t = useTranslations("guard.earnings");
  const tCommon = useTranslations("guard.common");
  const format = useFormatter();
  const statusLabel = getStatusLabel(payout.status, t);
  const showApprovedAmount = payout.status === PAYOUT_STATUS.APPROVED;
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

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-base font-semibold text-slate-900">
          {formatLocation(payout.building_name, payout.flat_number)}
        </p>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {statusLabel}
        </span>
      </div>

      <p className="text-base text-slate-600">
        {t("closureConfirmed")}:{" "}
        {formatDateTime(payout.closure_confirmed_at, format, t("dateUnavailable"))}
      </p>

      {showApprovedAmount ? (
        <p className="mt-2 text-base font-semibold text-slate-900">
          {amountLabel}{" "}
          {payout.amount_paise !== undefined
            ? formatCurrency(payout.amount_paise)
            : t("amountUnavailable")}
        </p>
      ) : (
        <p className="mt-2 text-base font-medium text-slate-800">
          {t("prospectiveBounty")}:{" "}
          {payout.prospective_bounty !== undefined
            ? formatCurrency(payout.prospective_bounty)
            : t("notSet")}
        </p>
      )}
    </article>
  );
}
