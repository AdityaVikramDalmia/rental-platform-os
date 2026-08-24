"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { AlertTriangle, CalendarSync, Loader2, Plus } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PERMISSIONS } from "../../../../../lib/constants";
import { AgentTargetsView } from "@/components/admin/ops-command-center/AgentTargetsView";
import { AgentProfileSheet } from "@/components/admin/ops-command-center/AgentProfileSheet";
import { BulkTargetDialog } from "@/components/admin/ops-command-center/BulkTargetDialog";
import { CelebrationsPanel } from "@/components/admin/ops-command-center/CelebrationsPanel";
import { FiresPanel } from "@/components/admin/ops-command-center/FiresPanel";
import { OpenActionItemsPanel } from "@/components/admin/ops-command-center/OpenActionItemsPanel";
import { PipelineAgingPanel } from "@/components/admin/ops-command-center/PipelineAgingPanel";
import { ReviewComplianceCard } from "@/components/admin/ops-command-center/ReviewComplianceCard";
import { SummaryCards } from "@/components/admin/ops-command-center/SummaryCards";
import { TeamHealthHeatmap } from "@/components/admin/ops-command-center/TeamHealthHeatmap";
import { TargetSettingDialog } from "@/components/admin/ops-command-center/TargetSettingDialog";
import { WarningDialog } from "@/components/admin/ops-command-center/WarningDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CommandCenterView = "ceo" | "ops_head";
type AgentSheetTab = "performance" | "targets" | "warnings" | "checkins" | "pipeline";

function parseView(value: string | null): CommandCenterView {
  if (value === "ceo" || value === "ops_head") {
    return value;
  }

  return "ceo";
}

export default function OpsCommandCenterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"users"> | null>(null);
  const [selectedAgentTab, setSelectedAgentTab] = useState<AgentSheetTab>("performance");
  const [openCheckInComposer, setOpenCheckInComposer] = useState(false);
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [bulkTargetDialogOpen, setBulkTargetDialogOpen] = useState(false);
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
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

  const hasOpsManagementView = permissionSet.has(PERMISSIONS.OPS_MANAGEMENT_VIEW);
  const hasOpsManagementSetTargets = permissionSet.has(PERMISSIONS.OPS_MANAGEMENT_SET_TARGETS);
  const hasOpsManagementIssueWarnings = permissionSet.has(
    PERMISSIONS.OPS_MANAGEMENT_ISSUE_WARNINGS,
  );
  const activeView = useMemo(() => parseView(searchParams.get("view")), [searchParams]);
  const isOpsHeadView = activeView === "ops_head";
  const [prevIsOpsHeadView, setPrevIsOpsHeadView] = useState(isOpsHeadView);

  // Clear ops-head-only UI state whenever the view switches away from
  // ops_head. Adjusting state directly during render (rather than in an
  // effect) avoids an extra commit-then-effect-then-recommit render cascade.
  if (prevIsOpsHeadView !== isOpsHeadView) {
    setPrevIsOpsHeadView(isOpsHeadView);
    if (!isOpsHeadView) {
      setTargetDialogOpen(false);
      setBulkTargetDialogOpen(false);
      setWarningDialogOpen(false);
      setSelectedAgentId(null);
      setSelectedAgentTab("performance");
      setOpenCheckInComposer(false);
    }
  }

  const handleViewChange = useCallback(
    (nextView: CommandCenterView) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", nextView);
      router.replace(`/admin/ops-command-center?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleOpenAgentProfile = useCallback((agentId: Id<"users">) => {
    setSelectedAgentId(agentId);
    setSelectedAgentTab("performance");
    setOpenCheckInComposer(false);
  }, []);

  const handleReviewAgent = useCallback((agentId: string, _agentName: string) => {
    setSelectedAgentId(agentId as Id<"users">);
    setSelectedAgentTab("checkins");
    setOpenCheckInComposer(true);
  }, []);

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

  if (!hasOpsManagementView) {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">
            Ops Command Center access restricted
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          You do not have permission to view ops management dashboards.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Ops Command Center
          </h2>
          <p className="text-sm text-slate-600">
            Multi-layer operations oversight with CEO and Ops Head perspectives.
          </p>
        </div>
        {isOpsHeadView && (hasOpsManagementSetTargets || hasOpsManagementIssueWarnings) ? (
          <div className="flex flex-wrap items-center gap-2">
            {hasOpsManagementIssueWarnings ? (
              <Button type="button" variant="outline" onClick={() => setWarningDialogOpen(true)}>
                <AlertTriangle className="size-4" />
                Issue Warning
              </Button>
            ) : null}
            {hasOpsManagementSetTargets ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBulkTargetDialogOpen(true)}
                >
                  <CalendarSync className="size-4" />
                  Bulk Targets
                </Button>
                <Button type="button" onClick={() => setTargetDialogOpen(true)}>
                  <Plus className="size-4" />
                  Set Target
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">View Mode</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={activeView === "ceo" ? "default" : "outline"}
            onClick={() => handleViewChange("ceo")}
            className="h-9"
            aria-pressed={activeView === "ceo"}
          >
            CEO View
          </Button>
          <Button
            type="button"
            variant={activeView === "ops_head" ? "default" : "outline"}
            onClick={() => handleViewChange("ops_head")}
            className="h-9"
            aria-pressed={activeView === "ops_head"}
          >
            Ops Head View
          </Button>
        </div>
        <p className="text-xs text-slate-600">
          {isOpsHeadView
            ? "Ops Head mode: aggregate dashboard with management actions and agent drill-down tools."
            : "CEO mode: aggregate dashboard with critical attention signals and team-level visibility."}
        </p>
      </div>

      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900">Summary Cards</h3>
          <p className="text-sm text-slate-600">At-a-glance metrics for throughput and risk.</p>
        </div>
        <SummaryCards />
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900">Team Health</h3>
          <p className="text-sm text-slate-600">Agent-level performance and wellness snapshot.</p>
        </div>
        <TeamHealthHeatmap action={isOpsHeadView ? handleOpenAgentProfile : undefined} />
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900">Fires</h3>
          <p className="text-sm text-slate-600">
            Urgent warnings and escalations needing intervention.
          </p>
        </div>
        <FiresPanel />
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900">Celebrations</h3>
          <p className="text-sm text-slate-600">
            Wins worth highlighting for team morale and recognition.
          </p>
        </div>
        <CelebrationsPanel />
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900">Pipeline Aging</h3>
          <p className="text-sm text-slate-600">
            Aging trends and bottlenecks across active workflows.
          </p>
        </div>
        <PipelineAgingPanel />
      </section>

      {isOpsHeadView ? (
        <>
          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-900">Review Compliance</h3>
              <p className="text-sm text-slate-600">
                Weekly manager review coverage with overdue follow-up prompts.
              </p>
            </div>
            <ReviewComplianceCard action={handleReviewAgent} />
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-900">Targets</h3>
              <p className="text-sm text-slate-600">KPI target tracking for active OPS agents.</p>
            </div>
            <AgentTargetsView />
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-900">Open Action Items</h3>
              <p className="text-sm text-slate-600">
                Uncompleted commitments from check-ins in the last 90 days.
              </p>
            </div>
            <OpenActionItemsPanel />
          </section>

          <TargetSettingDialog open={targetDialogOpen} action={setTargetDialogOpen} />
          <BulkTargetDialog open={bulkTargetDialogOpen} action={setBulkTargetDialogOpen} />
          <WarningDialog open={warningDialogOpen} onOpenChange={setWarningDialogOpen} />
          <AgentProfileSheet
            agentId={selectedAgentId}
            closeAction={() => {
              setSelectedAgentId(null);
              setSelectedAgentTab("performance");
              setOpenCheckInComposer(false);
            }}
            initialTab={selectedAgentTab}
            openCheckInComposer={openCheckInComposer}
          />
        </>
      ) : null}
    </div>
  );
}
