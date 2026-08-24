"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { CheckInForm } from "@/components/admin/ops-command-center/CheckInForm";
import { CheckInHistory } from "@/components/admin/ops-command-center/CheckInHistory";
import { PreCheckInBrief } from "@/components/admin/ops-command-center/PreCheckInBrief";
import { WarningDialog } from "@/components/admin/ops-command-center/WarningDialog";
import { WarningTimeline } from "@/components/admin/ops-command-center/WarningTimeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AgentProfileSheetProps = {
  agentId: Id<"users"> | null;
  closeAction: () => void;
  initialTab?: AgentProfileTab;
  openCheckInComposer?: boolean;
};

type AgentProfileTab = "performance" | "targets" | "warnings" | "checkins" | "pipeline";
type CheckInPhase = "history" | "brief" | "form";

function isAgentProfileTab(value: string): value is AgentProfileTab {
  return ["performance", "targets", "warnings", "checkins", "pipeline"].includes(value);
}

const HEALTH_BADGE_STYLE = {
  RED: "bg-red-100 text-red-700",
  YELLOW: "bg-amber-100 text-amber-700",
  GREEN: "bg-emerald-100 text-emerald-700",
} as const;

function formatDateTime(timestamp: number | null): string {
  if (timestamp === null) {
    return "N/A";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function AgentProfileSheet({
  agentId,
  closeAction,
  initialTab = "performance",
  openCheckInComposer = false,
}: AgentProfileSheetProps) {
  const heatmap = useQuery(api.opsManagement.getTeamHealthHeatmap);
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AgentProfileTab>(initialTab);
  const [checkInPhase, setCheckInPhase] = useState<CheckInPhase>("history");
  const isOpen = agentId !== null;

  const selectedAgent = useMemo(() => {
    if (!heatmap || !agentId) {
      return null;
    }

    return heatmap.find((agent) => agent.user_id === agentId) ?? null;
  }, [agentId, heatmap]);

  // Reset the active tab/check-in phase whenever the selected agent (or the initial tab
  // request) changes, mirroring the previous effect's dependency array. Adjusting state
  // during render (rather than in an effect) avoids a stale-content flash between the
  // selection changing and an effect resetting it. See "Adjusting state when a prop
  // changes": https://react.dev/learn/you-might-not-need-an-effect
  const [selectionTrigger, setSelectionTrigger] = useState({
    agentId,
    initialTab,
    openCheckInComposer,
  });
  if (
    agentId !== selectionTrigger.agentId ||
    initialTab !== selectionTrigger.initialTab ||
    openCheckInComposer !== selectionTrigger.openCheckInComposer
  ) {
    setSelectionTrigger({ agentId, initialTab, openCheckInComposer });
    if (agentId === null) {
      setCheckInPhase("history");
    } else {
      setActiveTab(initialTab);
      setCheckInPhase(initialTab === "checkins" && openCheckInComposer ? "brief" : "history");
    }
  }

  const isLoading = isOpen && heatmap === undefined;
  const isNotFound = isOpen && heatmap !== undefined && selectedAgent === null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeAction()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:w-[42vw] sm:max-w-none">
        <SheetHeader>
          {isLoading ? (
            <>
              <SheetTitle className="sr-only">Loading agent profile</SheetTitle>
              <SheetDescription className="sr-only">Please wait</SheetDescription>
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-4 w-36" />
            </>
          ) : selectedAgent ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SheetTitle>{selectedAgent.name}</SheetTitle>
                  <Badge className={HEALTH_BADGE_STYLE[selectedAgent.health_color]}>
                    {selectedAgent.health_color}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" onClick={() => setWarningDialogOpen(true)}>
                    Issue Warning
                  </Button>
                </div>
              </div>
              <SheetDescription>OPS agent profile and operational health details.</SheetDescription>
            </>
          ) : isNotFound ? (
            <>
              <SheetTitle>Agent not found</SheetTitle>
              <SheetDescription>
                This OPS agent is unavailable or no longer active.
              </SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle>Agent Profile</SheetTitle>
              <SheetDescription>Select an agent to view profile details.</SheetDescription>
            </>
          )}
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 px-4 py-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : null}

        {selectedAgent ? (
          <div className="space-y-5 px-4 pb-6">
            <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <p className="text-slate-600">
                  Name: <span className="font-medium text-slate-900">{selectedAgent.name}</span>
                </p>
                <p className="text-slate-600">
                  Phone:{" "}
                  <span className="font-medium text-slate-900">{selectedAgent.phone ?? "N/A"}</span>
                </p>
                <p className="text-slate-600">
                  Status: <span className="font-medium text-slate-900">{selectedAgent.status}</span>
                </p>
                <p className="text-slate-600">
                  Quality:{" "}
                  <span className="font-medium text-slate-900">
                    {selectedAgent.quality_score ?? "N/A"}
                  </span>
                </p>
                <p className="text-slate-600">
                  Warnings:{" "}
                  <span className="font-medium text-slate-900">
                    {selectedAgent.active_warning_count}
                  </span>
                </p>
                <p className="text-slate-600">
                  Last check-in:{" "}
                  <span className="font-medium text-slate-900">
                    {formatDateTime(selectedAgent.last_check_in_at)}
                  </span>
                </p>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">
              <p>
                Target overview:{" "}
                <span className="font-semibold text-slate-900">
                  {selectedAgent.active_target_count}
                </span>{" "}
                active, hit rate{" "}
                <span className="font-semibold text-slate-900">
                  {selectedAgent.target_hit_rate ?? "N/A"}%
                </span>
              </p>
              <p>
                Warning levels: L1 {selectedAgent.warning_level_breakdown.level1}, L2{" "}
                {selectedAgent.warning_level_breakdown.level2}, L3{" "}
                {selectedAgent.warning_level_breakdown.level3}
              </p>
            </section>

            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                if (isAgentProfileTab(value)) {
                  setActiveTab(value);
                }
              }}
              className="w-full"
            >
              <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 sm:grid-cols-5 sm:gap-1">
                <TabsTrigger value="performance" className="h-10 rounded-lg">
                  Performance
                </TabsTrigger>
                <TabsTrigger value="targets" className="h-10 rounded-lg">
                  Targets
                </TabsTrigger>
                <TabsTrigger value="warnings" className="h-10 rounded-lg">
                  Warnings
                </TabsTrigger>
                <TabsTrigger value="checkins" className="h-10 rounded-lg">
                  Check-ins
                </TabsTrigger>
                <TabsTrigger value="pipeline" className="h-10 rounded-lg">
                  Pipeline
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="performance"
                className="mt-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-600"
              >
                Coming soon
              </TabsContent>
              <TabsContent
                value="targets"
                className="mt-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-600"
              >
                Coming soon
              </TabsContent>
              <TabsContent value="warnings" className="mt-3 rounded-lg border border-slate-200 p-3">
                <WarningTimeline agentId={selectedAgent.user_id} />
              </TabsContent>
              <TabsContent value="checkins" className="mt-3 rounded-lg border border-slate-200 p-3">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">Check-In History</p>
                    <Button
                      type="button"
                      size="sm"
                      variant={checkInPhase === "history" ? "default" : "outline"}
                      onClick={() => {
                        if (checkInPhase === "history") {
                          setCheckInPhase("brief");
                          return;
                        }

                        if (checkInPhase === "brief") {
                          setCheckInPhase("history");
                          return;
                        }

                        setCheckInPhase("brief");
                      }}
                    >
                      {checkInPhase === "history"
                        ? "Prepare Check-In"
                        : checkInPhase === "brief"
                          ? "Back to History"
                          : "Back to Brief"}
                    </Button>
                  </div>

                  {checkInPhase === "brief" ? (
                    <PreCheckInBrief
                      agentId={selectedAgent.user_id}
                      agentName={selectedAgent.name}
                      onStartCheckInAction={() => setCheckInPhase("form")}
                    />
                  ) : null}

                  {checkInPhase === "form" ? (
                    <CheckInForm
                      agentId={selectedAgent.user_id}
                      agentName={selectedAgent.name}
                      action={(type) => {
                        if (type === "success") {
                          setCheckInPhase("history");
                          return;
                        }

                        setCheckInPhase("brief");
                      }}
                    />
                  ) : null}

                  <CheckInHistory agentId={selectedAgent.user_id} />
                </div>
              </TabsContent>
              <TabsContent
                value="pipeline"
                className="mt-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-600"
              >
                Coming soon
              </TabsContent>
            </Tabs>
          </div>
        ) : null}

        {isNotFound ? (
          <div className="px-4 py-4 text-sm text-slate-600">Agent not found.</div>
        ) : null}
      </SheetContent>

      {selectedAgent ? (
        <WarningDialog
          open={warningDialogOpen}
          onOpenChange={setWarningDialogOpen}
          preselectedAgentId={selectedAgent.user_id}
        />
      ) : null}
    </Sheet>
  );
}
