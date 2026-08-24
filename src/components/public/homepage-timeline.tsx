"use client";

import { Calendar, FileText, Home, Search } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    number: 1,
    icon: Search,
    title: "Search & Shortlist",
    description:
      "Browse verified listings filtered by area, budget, and BHK. Save your favorites and compare properties side by side.",
    duration: "Day 1-3",
  },
  {
    number: 2,
    icon: Calendar,
    title: "Schedule a Visit",
    description:
      "Pick a time slot that works for you. Our team coordinates a guided property tour \u2014 no awkward broker calls.",
    duration: "Day 3-7",
  },
  {
    number: 3,
    icon: FileText,
    title: "Apply & Sign",
    description:
      "Submit your rental application. We handle the paperwork, owner verification, and agreement preparation.",
    duration: "Day 7-14",
  },
  {
    number: 4,
    icon: Home,
    title: "Move In & Settle",
    description:
      "Collect your keys and move in. Our team supports you through the first month \u2014 utilities, society registration, everything.",
    duration: "Month 1",
  },
];

export function HomepageTimeline() {
  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200 md:left-1/2 md:-translate-x-1/2" />

      <div className="space-y-12 md:space-y-16">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isEven = index % 2 === 0;

          return (
            <BlurFade key={step.number} inView delay={index * 0.15}>
              <div className="relative flex items-start gap-6 md:gap-0">
                <div className="absolute left-4 z-10 flex size-10 -translate-x-1/2 items-center justify-center rounded-full border-2 border-blue-600 bg-white text-sm font-bold text-blue-600 shadow-lg md:left-1/2 md:-translate-x-1/2">
                  {step.number}
                </div>

                <div
                  className={cn(
                    "ml-12 w-full md:ml-0 md:w-[calc(50%-2rem)]",
                    isEven ? "md:mr-auto md:pr-8" : "md:ml-auto md:pl-8",
                  )}
                >
                  <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-blue-50">
                      <Icon className="size-6 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {step.description}
                    </p>
                    <span className="mt-3 inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                      {step.duration}
                    </span>
                  </div>
                </div>
              </div>
            </BlurFade>
          );
        })}
      </div>
    </div>
  );
}
