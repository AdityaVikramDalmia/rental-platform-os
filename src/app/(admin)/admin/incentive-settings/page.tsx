"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { PERMISSIONS } from "../../../../../lib/constants";
import { AttributionTab } from "@/components/admin/incentive-settings/attribution-tab";
import { AttributionViewerTab } from "@/components/admin/incentive-settings/attribution-viewer-tab";
import { CommissionTab } from "@/components/admin/incentive-settings/commission-tab";
import { GamificationTab } from "@/components/admin/incentive-settings/gamification-tab";
import { PersonasTab } from "@/components/admin/incentive-settings/personas-tab";
import { ProgramTab } from "@/components/admin/incentive-settings/program-tab";
import { ShadowDeltaTab } from "@/components/admin/incentive-settings/shadow-delta-tab";
import { SimulationTab } from "@/components/admin/incentive-settings/simulation-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type IncentiveSettingsTab =
  | "program"
  | "personas"
  | "commission"
  | "simulation"
  | "attribution"
  | "attribution-viewer"
  | "gamification"
  | "shadow-delta";

const DEFAULT_TAB: IncentiveSettingsTab = "program";

function parseTab(value: string | null): IncentiveSettingsTab {
  if (
    value === "program" ||
    value === "personas" ||
    value === "commission" ||
    value === "simulation" ||
    value === "attribution" ||
    value === "attribution-viewer" ||
    value === "gamification" ||
    value === "shadow-delta"
  ) {
    return value;
  }

  return DEFAULT_TAB;
}

export default function IncentiveSettingsPage() {
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

  const hasCommissionView = permissionSet.has(PERMISSIONS.COMMISSION_VIEW);
  const hasCommissionConfigure = permissionSet.has(PERMISSIONS.COMMISSION_CONFIGURE);
  const hasGamificationView = permissionSet.has(PERMISSIONS.GAMIFICATION_VIEW);
  const hasGamificationManage = permissionSet.has(PERMISSIONS.GAMIFICATION_MANAGE);
  const hasShadowModeView = permissionSet.has(PERMISSIONS.SHADOW_MODE_VIEW);
  const hasGuardsView = permissionSet.has(PERMISSIONS.GUARDS_VIEW);
  const hasRolesView = permissionSet.has(PERMISSIONS.ROLES_VIEW);
  const hasAttributionView = permissionSet.has(PERMISSIONS.ATTRIBUTION_VIEW);
  const hasAttributionDispute = permissionSet.has(PERMISSIONS.ATTRIBUTION_DISPUTE);
  const hasAttributionOverride = permissionSet.has(PERMISSIONS.ATTRIBUTION_OVERRIDE);
  const hasIncentiveSettingsAccess =
    hasCommissionView || hasAttributionView || hasGamificationView || hasShadowModeView;
  const canResolveUserNames =
    currentUser?.user_types?.includes("ADMIN") ?? currentUser?.user_type === "ADMIN";

  const activeTab = useMemo(() => parseTab(searchParams.get("tab")), [searchParams]);

  const tabPermissions = useMemo(
    () =>
      ({
        program: hasCommissionView,
        personas: hasCommissionView,
        commission: hasCommissionView,
        simulation: hasCommissionView,
        attribution: hasAttributionView,
        "attribution-viewer": hasAttributionView,
        gamification: hasGamificationView,
        "shadow-delta": hasShadowModeView,
      }) satisfies Record<IncentiveSettingsTab, boolean>,
    [hasAttributionView, hasCommissionView, hasGamificationView, hasShadowModeView],
  );

  const authorizedTabs = useMemo(() => {
    return (
      [
        { value: "program" as const, label: "Program" },
        { value: "personas" as const, label: "Personas" },
        { value: "commission" as const, label: "Commission" },
        { value: "simulation" as const, label: "Simulation" },
        { value: "attribution" as const, label: "Attribution" },
        { value: "attribution-viewer" as const, label: "Attribution Viewer" },
        { value: "gamification" as const, label: "Gamification" },
        { value: "shadow-delta" as const, label: "Shadow \u0394" },
      ] as const
    ).filter((tab) => tabPermissions[tab.value]);
  }, [tabPermissions]);

  const firstAuthorizedTab = authorizedTabs[0]?.value;
  const selectedTab =
    firstAuthorizedTab && tabPermissions[activeTab]
      ? activeTab
      : (firstAuthorizedTab ?? DEFAULT_TAB);

  const handleTabChange = useCallback(
    (nextTabValue: string) => {
      const parsedTab = parseTab(nextTabValue);
      const nextTab = tabPermissions[parsedTab] ? parsedTab : firstAuthorizedTab;
      if (!nextTab) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", nextTab);
      router.replace(`/admin/incentive-settings?${params.toString()}`, { scroll: false });
    },
    [firstAuthorizedTab, router, searchParams, tabPermissions],
  );

  if (currentUser === undefined || roleAssignments === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (
    !currentUser ||
    !(
      currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ??
      (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS")
    )
  ) {
    return null;
  }

  if (!hasIncentiveSettingsAccess) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view incentive settings.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Incentive Settings</h2>
        <p className="text-sm text-slate-600">
          Configure the v3 incentive framework across program, personas, commission, attribution,
          and gamification tracks.
        </p>
      </div>

      <Tabs value={selectedTab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start bg-slate-100">
          {authorizedTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabPermissions.program ? (
          <TabsContent value="program">
            <ProgramTab
              canConfigure={hasCommissionConfigure}
              canResolveUserNames={canResolveUserNames}
            />
          </TabsContent>
        ) : null}

        {tabPermissions.personas ? (
          <TabsContent value="personas">
            <PersonasTab
              canConfigure={hasCommissionConfigure}
              canResolveUserNames={canResolveUserNames}
              canLoadGuardUsers={hasGuardsView}
              canLoadAdminUsers={hasRolesView}
            />
          </TabsContent>
        ) : null}

        {tabPermissions.commission ? (
          <TabsContent value="commission">
            <CommissionTab canConfigure={hasCommissionConfigure} />
          </TabsContent>
        ) : null}

        {tabPermissions.simulation ? (
          <TabsContent value="simulation">
            <SimulationTab canRunSimulation={hasCommissionView} />
          </TabsContent>
        ) : null}

        {tabPermissions.attribution ? (
          <TabsContent value="attribution">
            <AttributionTab canConfigure={hasCommissionConfigure} />
          </TabsContent>
        ) : null}

        {tabPermissions["attribution-viewer"] ? (
          <TabsContent value="attribution-viewer">
            <AttributionViewerTab
              canDispute={hasAttributionDispute}
              canOverride={hasAttributionOverride}
            />
          </TabsContent>
        ) : null}

        {tabPermissions.gamification ? (
          <TabsContent value="gamification">
            <GamificationTab canConfigure={hasGamificationManage} />
          </TabsContent>
        ) : null}

        {tabPermissions["shadow-delta"] ? (
          <TabsContent value="shadow-delta">
            <ShadowDeltaTab />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
