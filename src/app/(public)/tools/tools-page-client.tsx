"use client";

import { useEffect, useState } from "react";
import { CommuteEstimator } from "@/components/tenant/commute-estimator";
import { RentCalculator } from "@/components/tenant/rent-calculator";
import { RentalChecklist } from "@/components/tenant/rental-checklist";
import { RoommateQuiz } from "@/components/tenant/roommate-quiz";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

const TOOL_TABS = ["rent-calculator", "commute-estimator", "roommate-quiz"] as const;

type ToolTab = (typeof TOOL_TABS)[number];

function isToolTab(value: string): value is ToolTab {
  return TOOL_TABS.some((tab) => tab === value);
}

export function ToolsPageClient() {
  const [activeTab, setActiveTab] = useState<ToolTab>("rent-calculator");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hashValue = window.location.hash.replace("#", "");
    if (isToolTab(hashValue)) {
      // Mount-only sync from the browser-only URL hash; reading window.location during
      // render would desync the SSR'd markup from the client's first hydration pass.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(hashValue);
    }
  }, []);

  return (
    <div className="bg-slate-50 py-10 sm:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Interactive Tenant Tools
            </h1>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">
              Plan your move with practical calculators, commute estimates, and a rental checklist
              that stays with you.
            </p>
          </div>

          <section aria-labelledby="tools-tabs-title">
            <h2 id="tools-tabs-title" className="text-lg font-semibold text-slate-900">
              Explore tools
            </h2>

            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                if (!isToolTab(value)) {
                  return;
                }

                setActiveTab(value);
                if (typeof window !== "undefined") {
                  window.history.replaceState(null, "", `#${value}`);
                }
              }}
              className="mt-4"
            >
              <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:h-9 sm:grid-cols-3 sm:gap-0">
                <TabsTrigger value="rent-calculator">Rent Calculator</TabsTrigger>
                <TabsTrigger value="commute-estimator">Commute Estimator</TabsTrigger>
                <TabsTrigger value="roommate-quiz">Roommate Quiz</TabsTrigger>
              </TabsList>

              <TabsContent
                value="rent-calculator"
                forceMount
                className="mt-6 data-[state=inactive]:hidden"
                id="rent-calculator"
              >
                <RentCalculator />
              </TabsContent>

              <TabsContent
                value="commute-estimator"
                forceMount
                className="mt-6 data-[state=inactive]:hidden"
                id="commute-estimator"
              >
                <CommuteEstimator />
              </TabsContent>

              <TabsContent
                value="roommate-quiz"
                forceMount
                className="mt-6 data-[state=inactive]:hidden"
                id="roommate-quiz"
              >
                <RoommateQuiz />
              </TabsContent>
            </Tabs>
          </section>

          <Separator className="my-8" />

          <section id="rental-checklist" aria-labelledby="rental-checklist-title">
            <h2 id="rental-checklist-title" className="text-lg font-semibold text-slate-900">
              Rental Checklist
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Track every prep step from first visit to your move-in week.
            </p>
            <div className="mt-4">
              <RentalChecklist />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
