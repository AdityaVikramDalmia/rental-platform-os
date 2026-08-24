"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ClipboardList, IndianRupee, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";

export function GuardOnboarding() {
  const t = useTranslations("guard.onboarding");
  const tCommon = useTranslations("guard.common");
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const dismissOnboarding = useMutation(api.guards.dismissOnboarding);

  const steps = [
    {
      icon: Search,
      title: t("step1Title"),
      description: t("step1Body"),
    },
    {
      icon: ClipboardList,
      title: t("step2Title"),
      description: t("step2Body"),
    },
    {
      icon: IndianRupee,
      title: t("step3Title"),
      description: t("step3Body"),
    },
  ] as const;

  async function handleDismiss() {
    setDismissed(true);
    try {
      await dismissOnboarding();
    } catch (error) {
      const message = error instanceof Error ? error.message : tCommon("error");
      toast.error(message);
    }
  }

  if (dismissed) {
    return null;
  }

  const isLastStep = step === steps.length - 1;
  const current = steps[step];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-[400px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="relative px-6 pb-6 pt-10">
          <div className="flex flex-col items-center text-center">
            <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-slate-100">
              <Icon className="size-8 text-slate-700" />
            </div>
            <h2 className="mb-2 text-xl font-bold tracking-tight text-slate-900">
              {current.title}
            </h2>
            <p className="text-base leading-relaxed text-slate-600">{current.description}</p>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2">
            {steps.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                aria-label={t("goToStep", { count: i + 1 })}
                className={`size-2.5 rounded-full transition-colors ${
                  i === step ? "bg-slate-900" : "bg-slate-300"
                }`}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-col items-center gap-3">
            {isLastStep ? (
              <Button
                onClick={handleDismiss}
                className="h-12 w-full min-w-[44px] rounded-xl text-base font-semibold"
              >
                {t("gotIt")}
              </Button>
            ) : (
              <Button
                onClick={() => setStep((s) => s + 1)}
                className="h-12 w-full min-w-[44px] rounded-xl text-base font-semibold"
              >
                {t("next")}
              </Button>
            )}
            <button
              type="button"
              onClick={handleDismiss}
              className="min-h-[44px] px-4 text-base font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              {t("skip")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
