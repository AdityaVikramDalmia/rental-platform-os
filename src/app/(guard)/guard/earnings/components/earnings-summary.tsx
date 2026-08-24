"use client";

import { useFormatter, useTranslations } from "next-intl";
import { paiseToRupees } from "../../../../../../lib/money";

export function EarningsSummary({ totalEarnedPaise }: { totalEarnedPaise: number }) {
  const t = useTranslations("guard.earnings");
  const format = useFormatter();

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t("totalEarned")}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-900">
        {format.number(paiseToRupees(totalEarnedPaise), "inr")}
      </p>
    </div>
  );
}
