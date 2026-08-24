"use client";

import { useEffect, useState } from "react";
import { CommuteEstimator } from "@/components/tenant/commute-estimator";
import { RentCalculator } from "@/components/tenant/rent-calculator";
import { RentalChecklist } from "@/components/tenant/rental-checklist";
import { RoommateQuiz } from "@/components/tenant/roommate-quiz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TOOL_TABS = ["rent-calculator", "commute-estimator", "roommate-quiz"] as const;

type ToolTab = (typeof TOOL_TABS)[number];

function isToolTab(value: string): value is ToolTab {
  return TOOL_TABS.some((tab) => tab === value);
}

export function TenantToolsPageClient() {
  const [activeTab, setActiveTab] = useState<ToolTab>("rent-calculator");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hashValue = window.location.hash.replace("#", "");
    if (isToolTab(hashValue)) {
      // The URL hash can only be read after mount (it's absent during SSR), and all
      // three tab panels are server-rendered with `forceMount`, so deriving the initial
      // tab during render would mismatch the server-rendered markup whenever the URL has
      // a hash. Syncing it here, once, after mount is the correct fix for that mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(hashValue);
    }
  }, []);

  return (
    <div className="space-y-4 pb-6">
      <Card className="border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl text-slate-900">Tenant Tools</CardTitle>
          <p className="text-sm text-slate-600">
            Plan your move with calculators, commute estimates, and your checklist tracker.
          </p>
        </CardHeader>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-5 p-4">
          <section aria-labelledby="tenant-tools-tabs-title" className="space-y-3">
            <h2
              id="tenant-tools-tabs-title"
              className="text-sm font-semibold uppercase tracking-wide text-slate-500"
            >
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
            >
              <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-xl bg-slate-100 p-1 sm:h-11 sm:grid-cols-3 sm:gap-1">
                <TabsTrigger value="rent-calculator" className="h-11 min-h-11 rounded-lg">
                  Rent Calculator
                </TabsTrigger>
                <TabsTrigger value="commute-estimator" className="h-11 min-h-11 rounded-lg">
                  Commute Estimator
                </TabsTrigger>
                <TabsTrigger value="roommate-quiz" className="h-11 min-h-11 rounded-lg">
                  Roommate Quiz
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="rent-calculator"
                forceMount
                className="mt-4 data-[state=inactive]:hidden"
                id="rent-calculator"
              >
                <RentCalculator />
              </TabsContent>

              <TabsContent
                value="commute-estimator"
                forceMount
                className="mt-4 data-[state=inactive]:hidden"
                id="commute-estimator"
              >
                <CommuteEstimator />
              </TabsContent>

              <TabsContent
                value="roommate-quiz"
                forceMount
                className="mt-4 data-[state=inactive]:hidden"
                id="roommate-quiz"
              >
                <RoommateQuiz />
              </TabsContent>
            </Tabs>
          </section>

          <Separator />

          <section
            id="rental-checklist"
            aria-labelledby="tenant-rental-checklist-title"
            className="space-y-2"
          >
            <h2
              id="tenant-rental-checklist-title"
              className="text-sm font-semibold uppercase tracking-wide text-slate-500"
            >
              Rental checklist
            </h2>
            <p className="text-sm text-slate-600">
              Keep track of everything from shortlist to move-in day.
            </p>
            <RentalChecklist />
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
