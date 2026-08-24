"use client";

import { Card, CardContent } from "@/components/ui/card";

type OwnerEarningsSummaryProps = {
  summary: {
    pending_paise: number;
    approved_paise: number;
    disbursed_paise: number;
    failed_paise: number;
    voided_paise: number;
    total_disbursed_paise: number;
  };
};

function formatInr(amountPaise: number): string {
  return (amountPaise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export function OwnerEarningsSummary({ summary }: OwnerEarningsSummaryProps) {
  const cards = [
    {
      label: "Pending",
      value: summary.pending_paise,
      cardClassName: "border-amber-200 bg-amber-50/70",
    },
    {
      label: "Approved",
      value: summary.approved_paise,
      cardClassName: "border-indigo-200 bg-indigo-50/70",
    },
    {
      label: "Disbursed",
      value: summary.disbursed_paise,
      cardClassName: "border-emerald-200 bg-emerald-50/70",
    },
    {
      label: "Failed / Voided",
      value: summary.failed_paise + summary.voided_paise,
      cardClassName: "border-rose-200 bg-rose-50/70",
    },
  ] as const;

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <Card key={card.label} className={card.cardClassName}>
            <CardContent className="space-y-1 p-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-600">
                {card.label}
              </p>
              <p className="text-lg font-semibold tracking-tight text-slate-900">
                {formatInr(card.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Lifetime disbursed total: {formatInr(summary.total_disbursed_paise)}
      </p>
    </section>
  );
}
