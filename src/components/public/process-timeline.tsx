"use client";

import { useMemo, useState } from "react";
import { FileText, Home, PartyPopper, Search, Star, Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ProcessStep = {
  id: string;
  title: string;
  description: string;
  duration: string;
  icon: React.ComponentType<{ className?: string }>;
};

const PROCESS_STEPS: ProcessStep[] = [
  {
    id: "search",
    title: "Search",
    description:
      "Tell us your preferred localities, budget, and move-in timeline. We shortlist verified options that match your needs.",
    duration: "1-2 days",
    icon: Search,
  },
  {
    id: "shortlist",
    title: "Shortlist",
    description:
      "Review rental homes with photos, rent breakdown, and availability. Compare options before scheduling visits.",
    duration: "1-3 days",
    icon: Star,
  },
  {
    id: "visit",
    title: "Visit",
    description:
      "Pick convenient slots and our team coordinates guided visits so you can inspect the property in person.",
    duration: "1-2 days",
    icon: Home,
  },
  {
    id: "apply",
    title: "Apply",
    description:
      "Submit basic documents and complete owner verification. We help with clarifications and negotiation support.",
    duration: "2-4 days",
    icon: FileText,
  },
  {
    id: "move-in",
    title: "Move In",
    description:
      "Finalize agreement, deposit, and handover checklist. Move-in is tracked so nothing slips through.",
    duration: "1-3 days",
    icon: Truck,
  },
  {
    id: "settle",
    title: "Settle",
    description:
      "Get post move-in support for any immediate issues, and close your journey with confidence.",
    duration: "Ongoing support",
    icon: PartyPopper,
  },
];

export function ProcessTimeline() {
  const [activeStepId, setActiveStepId] = useState(PROCESS_STEPS[0]?.id ?? "search");

  const activeStep = useMemo(
    () => PROCESS_STEPS.find((step) => step.id === activeStepId) ?? PROCESS_STEPS[0],
    [activeStepId],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4 md:hidden">
        {PROCESS_STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.id === activeStepId;
          const isLast = index === PROCESS_STEPS.length - 1;

          return (
            <div key={step.id} className="relative pl-12">
              {!isLast && (
                <div className="absolute left-[23px] top-11 h-[calc(100%-1.6rem)] w-px bg-slate-200" />
              )}
              <button
                type="button"
                onClick={() => setActiveStepId(step.id)}
                className={cn(
                  "absolute left-0 top-1 flex size-11 items-center justify-center rounded-full border transition-colors",
                  isActive
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-600",
                )}
                aria-label={`Open step: ${step.title}`}
              >
                <Icon className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveStepId(step.id)}
                className="w-full rounded-lg border border-transparent px-1 py-1 text-left"
              >
                <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                <p className="text-xs text-slate-500">{step.duration}</p>
              </button>
              {isActive && (
                <Card className="mt-2 border-blue-100 bg-blue-50/70 py-0">
                  <CardContent className="px-4 py-4 text-sm leading-relaxed text-slate-700">
                    {step.description}
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden space-y-6 md:block">
        <div className="grid grid-cols-3 gap-4 lg:grid-cols-6">
          {PROCESS_STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = step.id === activeStepId;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStepId(step.id)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-all",
                  isActive
                    ? "border-blue-200 bg-blue-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                <div
                  className={cn(
                    "mb-3 inline-flex size-10 items-center justify-center rounded-full",
                    isActive ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600",
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                <p className="mt-1 text-xs text-slate-500">{step.duration}</p>
              </button>
            );
          })}
        </div>

        {activeStep && (
          <Card className="border-blue-100 bg-blue-50/70 py-0">
            <CardContent className="space-y-2 px-6 py-5">
              <p className="text-base font-semibold text-slate-900">{activeStep.title}</p>
              <p className="text-sm leading-relaxed text-slate-700">{activeStep.description}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
