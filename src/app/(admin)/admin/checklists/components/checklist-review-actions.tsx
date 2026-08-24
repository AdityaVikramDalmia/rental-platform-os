"use client";

import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  CHECKLIST_STATUS,
  CHECKLIST_STATUS_LABELS,
  type ChecklistStatus,
} from "../../../../../../lib/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ReviewOutcome =
  | typeof CHECKLIST_STATUS.APPROVED
  | typeof CHECKLIST_STATUS.REJECTED
  | typeof CHECKLIST_STATUS.REVISION_REQUESTED;

type ChecklistReviewActionsProps = {
  checklistId: Id<"checklist_instances">;
  currentStatus: ChecklistStatus;
  onReviewComplete?: () => void;
};

const ACTION_CONFIG: Record<
  ReviewOutcome,
  {
    label: string;
    icon: typeof CheckCircle2;
    buttonClassName: string;
    confirmClassName: string;
    helperText: string;
  }
> = {
  [CHECKLIST_STATUS.APPROVED]: {
    label: "Approve",
    icon: CheckCircle2,
    buttonClassName: "bg-emerald-600 text-white hover:bg-emerald-700",
    confirmClassName: "bg-emerald-600 text-white hover:bg-emerald-700",
    helperText: "Checklist quality is acceptable and review is complete.",
  },
  [CHECKLIST_STATUS.REJECTED]: {
    label: "Reject",
    icon: XCircle,
    buttonClassName: "bg-red-600 text-white hover:bg-red-700",
    confirmClassName: "bg-red-600 text-white hover:bg-red-700",
    helperText: "Checklist is unusable and cannot proceed.",
  },
  [CHECKLIST_STATUS.REVISION_REQUESTED]: {
    label: "Request Revision",
    icon: RotateCcw,
    buttonClassName: "bg-amber-500 text-white hover:bg-amber-600",
    confirmClassName: "bg-amber-500 text-white hover:bg-amber-600",
    helperText: "Checklist needs corrections before it can be approved.",
  },
};

export function ChecklistReviewActions({
  checklistId,
  currentStatus,
  onReviewComplete,
}: ChecklistReviewActionsProps) {
  const reviewChecklist = useMutation(api.checklists.reviewChecklist);
  const latestChecklist = useQuery(api.checklists.getById, {
    checklist_id: checklistId,
  });

  const [activeOutcome, setActiveOutcome] = useState<ReviewOutcome | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resolvedStatus = latestChecklist?.status ?? currentStatus;
  const isTerminalStatus =
    resolvedStatus === CHECKLIST_STATUS.APPROVED || resolvedStatus === CHECKLIST_STATUS.REJECTED;
  const canReviewCurrentStatus =
    resolvedStatus === CHECKLIST_STATUS.SUBMITTED ||
    resolvedStatus === CHECKLIST_STATUS.UNDER_REVIEW;

  const isDialogOpen = activeOutcome !== null;
  const activeConfig = activeOutcome ? ACTION_CONFIG[activeOutcome] : null;

  const isNotesEmpty = reviewNotes.trim().length === 0;
  const disableActionButtons = isSubmitting || isTerminalStatus || !canReviewCurrentStatus;

  const dialogTitle = useMemo(() => {
    if (!activeOutcome) {
      return "Review Checklist";
    }

    return `${ACTION_CONFIG[activeOutcome].label} Checklist`;
  }, [activeOutcome]);

  async function handleConfirmReview() {
    if (!activeOutcome) {
      return;
    }

    const trimmedNotes = reviewNotes.trim();

    if (!trimmedNotes) {
      toast.error("Review notes are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      await reviewChecklist({
        checklist_id: checklistId,
        outcome: activeOutcome,
        review_notes: trimmedNotes,
      });

      toast.success(`Checklist ${CHECKLIST_STATUS_LABELS[activeOutcome].toLowerCase()}.`);
      setActiveOutcome(null);
      setReviewNotes("");
      onReviewComplete?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit checklist review";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Current status:{" "}
          <span className="font-medium text-slate-900">
            {CHECKLIST_STATUS_LABELS[resolvedStatus]}
          </span>
        </p>

        <div className="grid gap-2">
          <Button
            type="button"
            onClick={() => setActiveOutcome(CHECKLIST_STATUS.APPROVED)}
            className={ACTION_CONFIG[CHECKLIST_STATUS.APPROVED].buttonClassName}
            disabled={disableActionButtons}
          >
            <CheckCircle2 className="size-4" />
            Approve
          </Button>

          <Button
            type="button"
            onClick={() => setActiveOutcome(CHECKLIST_STATUS.REJECTED)}
            className={ACTION_CONFIG[CHECKLIST_STATUS.REJECTED].buttonClassName}
            disabled={disableActionButtons}
          >
            <XCircle className="size-4" />
            Reject
          </Button>

          <Button
            type="button"
            onClick={() => setActiveOutcome(CHECKLIST_STATUS.REVISION_REQUESTED)}
            className={ACTION_CONFIG[CHECKLIST_STATUS.REVISION_REQUESTED].buttonClassName}
            disabled={disableActionButtons}
          >
            <RotateCcw className="size-4" />
            Request Revision
          </Button>
        </div>

        {isTerminalStatus ? (
          <p className="text-sm text-slate-500">
            This checklist is terminal and can no longer be reviewed.
          </p>
        ) : null}

        {!isTerminalStatus && !canReviewCurrentStatus ? (
          <p className="text-sm text-slate-500">
            Only submitted or under-review checklists can be reviewed.
          </p>
        ) : null}
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            setActiveOutcome(null);
            setReviewNotes("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{activeConfig?.helperText}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="review-notes">Review Notes (required)</Label>
            <Textarea
              id="review-notes"
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              placeholder="Describe your decision and any required follow-up..."
              rows={5}
              disabled={isSubmitting}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setActiveOutcome(null);
                setReviewNotes("");
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleConfirmReview();
              }}
              className={activeConfig?.confirmClassName}
              disabled={isSubmitting || isNotesEmpty || !activeConfig}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                (activeConfig?.label ?? "Confirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
