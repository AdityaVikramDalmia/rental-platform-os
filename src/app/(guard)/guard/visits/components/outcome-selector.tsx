"use client";

import { VISIT_OUTCOME, type VisitOutcome } from "../../../../../../lib/constants";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type OutcomeOption = {
  value: VisitOutcome;
  emoji: string;
  label: string;
  description: string;
};

type OutcomeSelectorProps = {
  value: VisitOutcome | undefined;
  onChange: (value: VisitOutcome) => void;
  disabled?: boolean;
  blockedMessage?: string;
};

export function OutcomeSelector({
  value,
  onChange,
  disabled,
  blockedMessage,
}: OutcomeSelectorProps) {
  const t = useTranslations("guard.visits");
  const isDisabled = Boolean(disabled || blockedMessage);

  const outcomeOptions: OutcomeOption[] = [
    {
      value: VISIT_OUTCOME.INTERESTED,
      emoji: "😊",
      label: t("interested"),
      description: t("interestedDesc"),
    },
    {
      value: VISIT_OUTCOME.NOT_INTERESTED,
      emoji: "😐",
      label: t("notInterested"),
      description: t("notInterestedDesc"),
    },
    {
      value: VISIT_OUTCOME.FOLLOWUP,
      emoji: "🔄",
      label: t("followUp"),
      description: t("followUpDesc"),
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {outcomeOptions.map((option) => {
          const isSelected = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${option.label}: ${option.description}`}
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) {
                  onChange(option.value);
                }
              }}
              className={cn(
                "flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-2 py-3 text-center transition-all",
                isSelected
                  ? "border-slate-900 bg-slate-50 ring-2 ring-slate-900"
                  : "border-slate-200 bg-white hover:border-slate-300",
                isDisabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span className="text-2xl">{option.emoji}</span>
              <span className="text-xs font-bold text-slate-800">{option.label}</span>
              <span className="text-[11px] leading-tight text-slate-500">{option.description}</span>
            </button>
          );
        })}
      </div>

      {blockedMessage ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {blockedMessage}
        </p>
      ) : null}
    </div>
  );
}
