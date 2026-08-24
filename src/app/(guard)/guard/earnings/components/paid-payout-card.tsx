"use client";

import type { FunctionReturnType } from "convex/server";
import { useFormatter, useTranslations } from "next-intl";
import type { api } from "../../../../../../convex/_generated/api";
import { paiseToRupees } from "../../../../../../lib/money";

const IST_TZ = "Asia/Kolkata";

type GuardEarnings = FunctionReturnType<typeof api.payouts.getGuardEarnings>;
type DisbursedPayout = GuardEarnings["disbursed"][number];

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

export function PaidPayoutCard({ payout }: { payout: DisbursedPayout }) {
  const t = useTranslations("guard.earnings");
  const tCommon = useTranslations("guard.common");
  const format = useFormatter();

  function formatLocation(buildingName: string | null, flatNumber: string | null): string {
    if (flatNumber) {
      return t("buildingFlat", {
        building: buildingName ?? tCommon("noData"),
        flat: flatNumber,
      });
    }

    return buildingName ?? tCommon("noData");
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-base font-semibold text-slate-900">
        {formatLocation(payout.building_name, payout.flat_number)}
      </p>

      <p className="mt-2 text-lg font-bold text-slate-900">
        {payout.amount_paise !== undefined
          ? format.number(paiseToRupees(payout.amount_paise), "inr")
          : t("amountUnavailable")}
      </p>

      <p className="mt-2 text-base text-slate-600">
        {t("disbursedOn", {
          date: formatDateTime(payout.disbursed_at, format, t("dateUnavailable")),
        })}
      </p>

      <p className="mt-1 text-base text-slate-600">
        {t("paymentRef", {
          ref: payout.payment_reference?.trim() ? payout.payment_reference : t("notProvided"),
        })}
      </p>
    </article>
  );
}
