"use client";

import { useMutation } from "convex/react";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { CLOSURE_STATUS, type ClosureStatus } from "../../../../../../lib/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ClosureStatusActionsProps = {
  closureId: Id<"closures">;
  status: ClosureStatus;
  canConfirm?: boolean;
  canCancel?: boolean;
};

export function ClosureStatusActions({
  closureId,
  status,
  canConfirm = false,
  canCancel = false,
}: ClosureStatusActionsProps) {
  const confirmClosure = useMutation(api.closures.confirm);
  const cancelClosure = useMutation(api.closures.cancel);

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const isTerminal = status === CLOSURE_STATUS.CONFIRMED || status === CLOSURE_STATUS.CANCELLED;

  const handleConfirm = useCallback(async () => {
    setLoadingAction("confirm");
    try {
      await confirmClosure({ id: closureId });
      toast.success("Closure confirmed!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to confirm closure");
    } finally {
      setLoadingAction(null);
    }
  }, [confirmClosure, closureId]);

  const handleCancel = useCallback(async () => {
    setLoadingAction("cancel");
    try {
      await cancelClosure({ id: closureId });
      toast.success("Closure cancelled");
      setShowCancelDialog(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel closure");
    } finally {
      setLoadingAction(null);
    }
  }, [cancelClosure, closureId]);

  if (isTerminal) {
    return null;
  }

  const isLoading = loadingAction !== null;
  const showConfirm = status === CLOSURE_STATUS.PENDING && canConfirm;
  const showCancel = status === CLOSURE_STATUS.PENDING && canCancel;

  if (!showConfirm && !showCancel) {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {showConfirm && (
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

        {showCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowCancelDialog(true)}
            disabled={isLoading}
            className="gap-1.5 text-slate-600"
          >
            {loadingAction === "cancel" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <XCircle className="size-4" />
            )}
            Cancel Closure
          </Button>
        )}
      </div>

      <Dialog
        open={showCancelDialog}
        onOpenChange={(open) => {
          if (!open) setShowCancelDialog(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Closure</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this closure? Any linked payouts in INITIATED status
              will be voided. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              disabled={isLoading}
            >
              Go Back
            </Button>
            <Button
              type="button"
              onClick={handleCancel}
              disabled={isLoading}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                "Cancel Closure"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
