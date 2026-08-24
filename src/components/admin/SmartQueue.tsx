"use client";

import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { LEAD_STATUS } from "../../../lib/constants";
import { PriorityBadge } from "@/components/admin/PriorityBadge";
import { SLABadge } from "@/components/admin/SLABadge";
import { VerificationDialog } from "@/components/admin/VerificationDialog";
import type { VerificationLead } from "@/components/admin/VerificationTable";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type SmartQueueProps = {
  canReject: boolean;
};

type SmartQueueLead = VerificationLead & {
  priority_score: number;
  priority_tier: "HIGH" | "MEDIUM" | "LOW";
};

export function SmartQueue({ canReject }: SmartQueueProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedLead, setSelectedLead] = useState<VerificationLead | null>(null);
  const [isVerificationDialogOpen, setIsVerificationDialogOpen] = useState(false);
  const [leadToReject, setLeadToReject] = useState<SmartQueueLead | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const rejectLeadMutation = useMutation(api.leads.reject);

  const submittedLeadsResult = useQuery(api.leads.list, {
    paginationOpts: { numItems: 20, cursor: null },
    status: LEAD_STATUS.SUBMITTED,
  });
  const needInfoLeadsResult = useQuery(api.leads.list, {
    paginationOpts: { numItems: 20, cursor: null },
    status: LEAD_STATUS.NEED_INFO,
  });

  const isLoading = submittedLeadsResult === undefined || needInfoLeadsResult === undefined;

  const smartQueueLeads = useMemo(() => {
    if (!submittedLeadsResult || !needInfoLeadsResult) {
      return [] as SmartQueueLead[];
    }

    const combined = [
      ...submittedLeadsResult.page,
      ...needInfoLeadsResult.page,
    ] as SmartQueueLead[];

    return combined
      .sort((a, b) => {
        if (b.priority_score !== a.priority_score) {
          return b.priority_score - a.priority_score;
        }

        return a._creationTime - b._creationTime;
      })
      .slice(0, 10);
  }, [needInfoLeadsResult, submittedLeadsResult]);

  const queueCount = smartQueueLeads.length;

  async function handleRejectLead() {
    if (!leadToReject) {
      return;
    }

    const reason = rejectReason.trim();
    if (!reason) {
      toast.error("Rejection reason is required.");
      return;
    }

    setIsRejecting(true);
    try {
      await rejectLeadMutation({ lead_id: leadToReject._id, reason });
      toast.success("Lead rejected");
      setLeadToReject(null);
      setRejectReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject lead");
    } finally {
      setIsRejecting(false);
    }
  }

  return (
    <>
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold text-slate-900">
                Smart Queue - Top 10 Leads to Verify
              </CardTitle>
              <p className="text-sm text-slate-500">Sorted by priority score</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {queueCount} lead{queueCount === 1 ? "" : "s"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsCollapsed((previous) => !previous)}
                aria-label={isCollapsed ? "Expand smart queue" : "Collapse smart queue"}
              >
                {isCollapsed ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronUp className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {!isCollapsed ? (
          <CardContent className="space-y-3 pt-0">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`smart-queue-skeleton-${index}`}
                  className="rounded-lg border border-slate-100 px-4 py-3"
                >
                  <Skeleton className="h-12 w-full" />
                </div>
              ))
            ) : smartQueueLeads.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-5">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="size-5" />
                  <p className="text-sm font-medium">All clear - no leads awaiting verification</p>
                </div>
              </div>
            ) : (
              smartQueueLeads.map((lead) => (
                <div
                  key={lead._id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <PriorityBadge tier={lead.priority_tier} score={lead.priority_score} />

                  <div className="min-w-[240px] flex-1">
                    <p className="text-sm font-medium text-slate-800">
                      {lead.society_name ?? "Society"} · {lead.building_name ?? "Building"} ·{" "}
                      {lead.flat_number}
                    </p>
                    <p className="text-xs text-slate-500">Guard: {lead.guard_name ?? "Unknown"}</p>
                  </div>

                  <SLABadge
                    entity_type="lead"
                    sla_started_at_ms={lead.sla_started_at_ms ?? lead._creationTime}
                  />

                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => {
                        setSelectedLead(lead);
                        setIsVerificationDialogOpen(true);
                      }}
                    >
                      Verify
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => {
                        setLeadToReject(lead);
                        setRejectReason("");
                      }}
                      disabled={!canReject}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        ) : null}
      </Card>

      {selectedLead ? (
        <VerificationDialog
          isOpen={isVerificationDialogOpen}
          setOpenAction={(open) => {
            setIsVerificationDialogOpen(open);
            if (!open) {
              setSelectedLead(null);
            }
          }}
          lead={selectedLead}
        />
      ) : null}

      <AlertDialog
        open={leadToReject !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLeadToReject(null);
            setRejectReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Add a clear reason. This action marks the lead as rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            rows={4}
            placeholder="Enter rejection reason"
          />

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRejecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleRejectLead();
              }}
              disabled={isRejecting || rejectReason.trim().length === 0}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isRejecting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                "Confirm Reject"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
