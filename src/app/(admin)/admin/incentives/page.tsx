"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { PERMISSIONS } from "../../../../../lib/constants";
import { ActiveCardsTab } from "./components/active-cards-tab";
import { IncentiveConfigPanel } from "./components/incentive-config-panel";
import { PendingSuggestionsTab } from "./components/pending-suggestions-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type IncentiveTab = "pending" | "active" | "config";

const DEFAULT_TAB: IncentiveTab = "pending";

function parseTab(value: string | null): IncentiveTab {
  if (value === "pending" || value === "active" || value === "config") {
    return value;
  }

  return DEFAULT_TAB;
}

export default function IncentivesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );

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

  const hasIncentivesView = permissionSet.has(PERMISSIONS.INCENTIVES_VIEW);
  const hasIncentivesAward = permissionSet.has(PERMISSIONS.INCENTIVES_AWARD);
  const hasIncentivesExpire = permissionSet.has(PERMISSIONS.INCENTIVES_EXPIRE);
  const hasSystemConfigure = permissionSet.has(PERMISSIONS.SYSTEM_CONFIGURE);

  const activeTab = useMemo(() => parseTab(searchParams.get("tab")), [searchParams]);

  const handleTabChange = useCallback(
    (nextTabValue: string) => {
      const nextTab = parseTab(nextTabValue);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", nextTab);
      router.replace(`/admin/incentives?${params.toString()}`, { scroll: false });
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

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) { return null; }

  if (!hasIncentivesView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view incentives.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Incentive Management
        </h2>
        <p className="text-sm text-slate-600">
          Review auto-suggestions, manage active cards, and configure auto-award thresholds.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start bg-slate-100">
          <TabsTrigger value="pending">Pending Suggestions</TabsTrigger>
          <TabsTrigger value="active">Active Cards</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <PendingSuggestionsTab canAward={hasIncentivesAward} />
        </TabsContent>

        <TabsContent value="active">
          <ActiveCardsTab canAward={hasIncentivesAward} canExpire={hasIncentivesExpire} />
        </TabsContent>

        <TabsContent value="config">
          <IncentiveConfigPanel canManage={hasSystemConfigure} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
