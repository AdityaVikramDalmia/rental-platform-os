"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { PERMISSIONS } from "../../../../../lib/constants";
import { FinancialTab } from "./components/financial-tab";
import { GuardLeaderboardTab } from "./components/guard-leaderboard-tab";
import { OperationalTab } from "./components/operational-tab";
import { OverviewTab } from "./components/overview-tab";
import { SocietyTab } from "./components/society-tab";
import { OpsSupersetGateCard } from "@/components/admin/dashboard/OpsSupersetGateCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AnalyticsTab = "overview" | "societies" | "guards" | "financial" | "operational";

export type TimeWindow = "last_7_days" | "last_30_days" | "last_90_days" | "all_time";
export type PersonaFilter = "GUARD" | "OPS" | "ALL";

const DEFAULT_TAB: AnalyticsTab = "overview";
const DEFAULT_PERSONA_FILTER: PersonaFilter = "GUARD";

const TIME_WINDOW_OPTIONS: Array<{ label: string; value: TimeWindow }> = [
  { label: "7 Days", value: "last_7_days" },
  { label: "30 Days", value: "last_30_days" },
  { label: "90 Days", value: "last_90_days" },
  { label: "All Time", value: "all_time" },
];

function parseTab(value: string | null): AnalyticsTab {
  if (
    value === "overview" ||
    value === "societies" ||
    value === "guards" ||
    value === "financial" ||
    value === "operational"
  ) {
    return value;
  }

  return DEFAULT_TAB;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("last_30_days");
  const [personaFilter, setPersonaFilter] = useState<PersonaFilter>(DEFAULT_PERSONA_FILTER);

  const permissionSet = useMemo(() => {
    const permissions = new Set<string>();

    if (!roleAssignments) {
      return permissions;
    }

    for (const assignment of roleAssignments) {
      for (const permission of assignment.role.permissions) {
        permissions.add(permission);
      }
    }

    return permissions;
  }, [roleAssignments]);

  const hasAnalyticsView = permissionSet.has(PERMISSIONS.ANALYTICS_VIEW);
  const hasPayoutsView = permissionSet.has(PERMISSIONS.PAYOUTS_VIEW);
  const activeTab = useMemo(() => parseTab(searchParams.get("tab")), [searchParams]);

  const handleTabChange = useCallback(
    (nextTabValue: string) => {
      const nextTab = parseTab(nextTabValue);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", nextTab);
      router.replace(`/admin/analytics?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  if (currentUser === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) {
    return null;
  }

  if (roleAssignments === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!hasAnalyticsView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view analytics.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Analytics Dashboard
        </h2>
        <p className="text-sm text-slate-600">
          Track lead health, society performance, guard output, finances, and operational speed.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
        {TIME_WINDOW_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={timeWindow === option.value ? "default" : "outline"}
            onClick={() => setTimeWindow(option.value)}
            className="h-9"
          >
            {option.label}
          </Button>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="societies">Societies</TabsTrigger>
          <TabsTrigger value="guards">Guards</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="operational">Operational</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab timeWindow={timeWindow} personaFilter={personaFilter} />
        </TabsContent>

        <TabsContent value="societies" className="mt-4">
          <SocietyTab timeWindow={timeWindow} personaFilter={personaFilter} />
        </TabsContent>

        <TabsContent value="guards" className="mt-4">
          <GuardLeaderboardTab
            timeWindow={timeWindow}
            hasPayoutsView={hasPayoutsView}
            personaFilter={personaFilter}
            onPersonaFilterChangeAction={setPersonaFilter}
          />
        </TabsContent>

        <TabsContent value="financial" className="mt-4">
          <FinancialTab timeWindow={timeWindow} hasPayoutsView={hasPayoutsView} />
        </TabsContent>

        <TabsContent value="operational" className="mt-4 space-y-4">
          <OpsSupersetGateCard timeWindow={timeWindow} />
          <OperationalTab timeWindow={timeWindow} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
