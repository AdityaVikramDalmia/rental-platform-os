"use client";

import { useMutation } from "convex/react";
import { CheckCircle, Loader2, UserX, XCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { VISIT_STATUS, type VisitStatus } from "../../../../../../lib/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type VisitStatusActionsProps = {
  visitId: Id<"visits">;
  status: VisitStatus;
  canEdit?: boolean;
  canCancel?: boolean;
};

type ActionDialogState = {
  type: "cancel" | "no_show";
  text: string;
};

export function VisitStatusActions({
  visitId,
  status,
  canEdit = true,
  canCancel = true,
}: VisitStatusActionsProps) {
  const confirmVisit = useMutation(api.visits.confirm);
  const cancelVisit = useMutation(api.visits.cancel);
  const markNoShow = useMutation(api.visits.markNoShow);

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);

  const isTerminal =
    status === VISIT_STATUS.COMPLETED ||
    status === VISIT_STATUS.CANCELLED ||
    status === VISIT_STATUS.NO_SHOW;

  const canConfirm = canEdit && status === VISIT_STATUS.ASSIGNED;
  const canCancelVisit =
    canCancel && (status === VISIT_STATUS.ASSIGNED || status === VISIT_STATUS.CONFIRMED);
  const canMarkNoShow =
    canEdit && (status === VISIT_STATUS.ASSIGNED || status === VISIT_STATUS.CONFIRMED);

  const handleConfirm = useCallback(async () => {
    setLoadingAction("confirm");
    try {
      await confirmVisit({ id: visitId });
      toast.success("Visit confirmed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to confirm visit");
    } finally {
      setLoadingAction(null);
    }
  }, [confirmVisit, visitId]);

  const handleActionSubmit = useCallback(async () => {
    if (!actionDialog) return;
    const actionType = actionDialog.type;
    const text = actionDialog.text.trim() || undefined;

    setLoadingAction(actionType);
    try {
      if (actionType === "cancel") {
        await cancelVisit({ id: visitId, reason: text });
        toast.success("Visit cancelled");
      } else {
        await markNoShow({ id: visitId, notes: text });
        toast.success("Visit marked as no-show");
      }
      setActionDialog(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${actionType === "cancel" ? "cancel" : "mark no-show"}`,
      );
    } finally {
      setLoadingAction(null);
    }
  }, [actionDialog, cancelVisit, markNoShow, visitId]);

  if (isTerminal) {
    return null;
  }

  const isLoading = loadingAction !== null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canConfirm && (
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="gap-1.5 bg-green-600 text-white hover:bg-green-700"
          >
            {loadingAction === "confirm" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle className="size-4" />
            )}
            Confirm
          </Button>
        )}

        {canCancelVisit && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setActionDialog({ type: "cancel", text: "" })}
            disabled={isLoading}
            className="gap-1.5 text-slate-600"
          >
            {loadingAction === "cancel" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <XCircle className="size-4" />
            )}
            Cancel Visit
          </Button>
        )}

        {canMarkNoShow && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setActionDialog({ type: "no_show", text: "" })}
            disabled={isLoading}
            className="gap-1.5 text-red-600 hover:text-red-700"
          >
            {loadingAction === "no_show" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserX className="size-4" />
            )}
            Mark No-Show
          </Button>
        )}
      </div>

      <Dialog
        open={actionDialog !== null}
        onOpenChange={(open) => {
          if (!open) setActionDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "cancel" ? "Cancel Visit" : "Mark No-Show"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog?.type === "cancel"
                ? "Are you sure you want to cancel this visit? This action cannot be undone."
                : "Mark this visit as a no-show. The guard did not appear for the scheduled visit."}
            </DialogDescription>
          </DialogHeader>

          <div>
            <label
              htmlFor="action-text"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              {actionDialog?.type === "cancel" ? "Reason (optional)" : "Notes (optional)"}
            </label>
            <Textarea
              id="action-text"
              rows={3}
              value={actionDialog?.text ?? ""}
              onChange={(e) =>
                setActionDialog((prev) => (prev ? { ...prev, text: e.target.value } : null))
              }
              placeholder={
                actionDialog?.type === "cancel"
                  ? "Why is this visit being cancelled?"
                  : "Additional notes about the no-show..."
              }
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setActionDialog(null)}
              disabled={isLoading}
            >
              Go Back
            </Button>
            <Button
              type="button"
              onClick={handleActionSubmit}
              disabled={isLoading}
              className={
                actionDialog?.type === "cancel"
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "bg-red-600 text-white hover:bg-red-700"
              }
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Processing...
                </>
              ) : actionDialog?.type === "cancel" ? (
                "Cancel Visit"
              ) : (
                "Mark No-Show"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
