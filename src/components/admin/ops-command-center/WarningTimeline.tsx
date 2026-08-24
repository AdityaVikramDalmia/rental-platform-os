"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { WarningBadge } from "@/components/admin/ops-command-center/WarningBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type WarningTimelineProps = {
  agentId: Id<"users">;
};

const STATUS_CLASS_MAP: Record<string, string> = {
  ACTIVE: "bg-red-100 text-red-700",
  ACKNOWLEDGED: "bg-amber-100 text-amber-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  EXPIRED: "bg-slate-100 text-slate-700",
  ESCALATED: "bg-purple-100 text-purple-700",
};

const TRIGGER_REASON_LABELS: Record<string, string> = {
  LOW_QUALITY_SCORE: "Low Quality Score",
  MISSED_TARGETS: "Missed Targets",
  SLA_BREACHES: "SLA Breaches",
  INACTIVITY: "Inactivity",
  CUSTOM: "Custom",
};

function formatDateTime(timestamp: number | undefined): string {
  if (!timestamp) {
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

export function WarningTimeline({ agentId }: WarningTimelineProps) {
  const warnings = useQuery(api.opsManagement.listWarningsForAgent, {
    agent_user_id: agentId,
    limit: 50,
  });
  const acknowledgeWarning = useMutation(api.opsManagement.acknowledgeWarning);
  const resolveWarning = useMutation(api.opsManagement.resolveWarning);
  const escalateWarning = useMutation(api.opsManagement.escalateWarning);

  const [actionInFlightId, setActionInFlightId] = useState<Id<"ops_warnings"> | null>(null);
  const [resolveOpenId, setResolveOpenId] = useState<Id<"ops_warnings"> | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [escalateConfirmId, setEscalateConfirmId] = useState<Id<"ops_warnings"> | null>(null);

  const escalateCandidate = useMemo(() => {
    if (!warnings || !escalateConfirmId) {
      return null;
    }

    return warnings.find((warning) => warning._id === escalateConfirmId) ?? null;
  }, [warnings, escalateConfirmId]);

  async function handleAcknowledge(warningId: Id<"ops_warnings">) {
    setActionInFlightId(warningId);
    try {
      await acknowledgeWarning({ warning_id: warningId });
      toast.success("Warning acknowledged");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to acknowledge warning";
      toast.error(message);
    } finally {
      setActionInFlightId(null);
    }
  }

  async function handleResolve(warningId: Id<"ops_warnings">) {
    setActionInFlightId(warningId);
    try {
      await resolveWarning({
        warning_id: warningId,
        resolution_notes: resolutionNotes[warningId]?.trim() || undefined,
      });
      toast.success("Warning resolved");
      setResolveOpenId(null);
      setResolutionNotes((current) => ({ ...current, [warningId]: "" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to resolve warning";
      toast.error(message);
    } finally {
      setActionInFlightId(null);
    }
  }

  async function handleEscalate() {
    if (!escalateConfirmId) {
      return;
    }

    setActionInFlightId(escalateConfirmId);
    try {
      await escalateWarning({ warning_id: escalateConfirmId });
      toast.success("Warning escalated");
      setEscalateConfirmId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to escalate warning";
      toast.error(message);
    } finally {
      setActionInFlightId(null);
    }
  }

  if (warnings === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_value, index) => (
          <div key={`warning-timeline-skeleton-${index + 1}`} className="rounded-lg border p-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (warnings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        No warnings.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {warnings.map((warning) => {
          const isActionRunning = actionInFlightId === warning._id;
          const isResolveOpen = resolveOpenId === warning._id;
          const canTakeAction = warning.status === "ACTIVE" || warning.status === "ACKNOWLEDGED";

          return (
            <div
              key={warning._id}
              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <WarningBadge level={warning.warning_level} />
                <Badge
                  className={STATUS_CLASS_MAP[warning.status] ?? "bg-slate-100 text-slate-700"}
                >
                  {warning.status}
                </Badge>
                <Badge variant="outline" className="border-slate-300 text-slate-700">
                  {TRIGGER_REASON_LABELS[warning.trigger_reason] ?? warning.trigger_reason}
                </Badge>
              </div>

              <p className="mt-2 text-sm text-slate-900">{warning.description}</p>

              {warning.escalated_from_id ? (
                <p className="mt-2 text-xs text-purple-700">
                  Escalated from{" "}
                  {warning.escalated_from
                    ? `L${warning.escalated_from.warning_level}`
                    : "a previous warning"}
                </p>
              ) : null}

              <div className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-3">
                <p>Issued: {formatDateTime(warning.created_at)}</p>
                <p>Acknowledged: {formatDateTime(warning.acknowledged_at)}</p>
                <p>Resolved: {formatDateTime(warning.resolved_at)}</p>
              </div>

              {canTakeAction ? (
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isActionRunning || warning.status !== "ACTIVE"}
                      onClick={() => handleAcknowledge(warning._id)}
                    >
                      Acknowledge
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isActionRunning}
                      onClick={() => setResolveOpenId(isResolveOpen ? null : warning._id)}
                    >
                      Resolve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isActionRunning || warning.warning_level >= 3}
                      onClick={() => setEscalateConfirmId(warning._id)}
                    >
                      Escalate
                    </Button>
                  </div>

                  {isResolveOpen ? (
                    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                      <Textarea
                        value={resolutionNotes[warning._id] ?? ""}
                        onChange={(event) =>
                          setResolutionNotes((current) => ({
                            ...current,
                            [warning._id]: event.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="Resolution notes (optional)"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setResolveOpenId(null)}
                          disabled={isActionRunning}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleResolve(warning._id)}
                          disabled={isActionRunning}
                        >
                          Confirm Resolve
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={escalateConfirmId !== null}
        onOpenChange={(open) => !open && setEscalateConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Escalate warning?</AlertDialogTitle>
            <AlertDialogDescription>
              {escalateCandidate
                ? `This will mark L${escalateCandidate.warning_level} as escalated and create a new L${Math.min(escalateCandidate.warning_level + 1, 3)} warning.`
                : "This action will escalate the selected warning."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionInFlightId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={actionInFlightId !== null} onClick={handleEscalate}>
              Confirm Escalation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
