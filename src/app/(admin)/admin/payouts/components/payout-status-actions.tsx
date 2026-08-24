"use client";

import { useMutation } from "convex/react";
import { CheckCircle, Loader2, OctagonX, Send, ShieldX } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { PAYOUT_STATUS, type PayoutStatus } from "../../../../../../lib/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PayoutStatusActionsProps = {
  payoutId: Id<"payouts">;
  status: PayoutStatus;
  canApprove?: boolean;
  canDisburse?: boolean;
  canVoid?: boolean;
};

export function PayoutStatusActions({
  payoutId,
  status,
  canApprove = false,
  canDisburse = false,
  canVoid = false,
}: PayoutStatusActionsProps) {
  const approvePayout = useMutation(api.payouts.approve);
  const disbursePayout = useMutation(api.payouts.disburse);
  const failPayout = useMutation(api.payouts.fail);
  const voidPayout = useMutation(api.payouts.voidPayout);

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isDisburseOpen, setIsDisburseOpen] = useState(false);
  const [isFailOpen, setIsFailOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [voidReason, setVoidReason] = useState("");

  const showApprove = status === PAYOUT_STATUS.PENDING && canApprove;
  const showVoid =
    (status === PAYOUT_STATUS.PENDING || status === PAYOUT_STATUS.APPROVED) && canVoid;
  const showDisburse = status === PAYOUT_STATUS.APPROVED && canDisburse;
  const showFail = status === PAYOUT_STATUS.APPROVED && canDisburse;

  const isLoading = loadingAction !== null;

  const handleApprove = useCallback(async () => {
    setLoadingAction("approve");
    try {
      await approvePayout({ id: payoutId });
      toast.success("Payout approved!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve payout");
    } finally {
      setLoadingAction(null);
    }
  }, [approvePayout, payoutId]);

  const handleDisburse = useCallback(async () => {
    setLoadingAction("disburse");
    try {
      await disbursePayout({
        id: payoutId,
        payment_reference: paymentReference.trim() || undefined,
      });
      toast.success("Payout disbursed!");
      setIsDisburseOpen(false);
      setPaymentReference("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disburse payout");
    } finally {
      setLoadingAction(null);
    }
  }, [disbursePayout, paymentReference, payoutId]);

  const handleMarkFailed = useCallback(async () => {
    const reason = failureReason.trim();
    if (!reason) {
      toast.error("Failure reason is required");
      return;
    }

    setLoadingAction("fail");
    try {
      await failPayout({ id: payoutId, failure_reason: reason });
      toast.success("Payout marked failed");
      setIsFailOpen(false);
      setFailureReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark payout as failed");
    } finally {
      setLoadingAction(null);
    }
  }, [failPayout, failureReason, payoutId]);

  const handleVoid = useCallback(async () => {
    setLoadingAction("void");
    try {
      await voidPayout({ id: payoutId, voided_reason: voidReason.trim() || undefined });
      toast.success("Payout voided");
      setIsVoidOpen(false);
      setVoidReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to void payout");
    } finally {
      setLoadingAction(null);
    }
  }, [payoutId, voidPayout, voidReason]);

  if (!showApprove && !showVoid && !showDisburse && !showFail) {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {showApprove && (
          <Button
            type="button"
            size="sm"
            onClick={handleApprove}
            disabled={isLoading}
            className="h-7 gap-1 bg-green-600 px-2 text-xs text-white hover:bg-green-700"
          >
            {loadingAction === "approve" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <CheckCircle className="size-3" />
            )}
            Approve
          </Button>
        )}

        {showDisburse && (
          <Button
            type="button"
            size="sm"
            onClick={() => setIsDisburseOpen(true)}
            disabled={isLoading}
            className="h-7 gap-1 bg-blue-600 px-2 text-xs text-white hover:bg-blue-700"
          >
            {loadingAction === "disburse" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Send className="size-3" />
            )}
            Disburse
          </Button>
        )}

        {showFail && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setIsFailOpen(true)}
            disabled={isLoading}
            className="h-7 gap-1 border-red-200 px-2 text-xs text-red-700 hover:bg-red-50 hover:text-red-700"
          >
            {loadingAction === "fail" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <OctagonX className="size-3" />
            )}
            Mark Failed
          </Button>
        )}

        {showVoid && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setIsVoidOpen(true)}
            disabled={isLoading}
            className="h-7 gap-1 border-slate-300 px-2 text-xs text-slate-700"
          >
            {loadingAction === "void" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ShieldX className="size-3" />
            )}
            Void
          </Button>
        )}
      </div>

      <Dialog open={isDisburseOpen} onOpenChange={setIsDisburseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Disburse Payout</DialogTitle>
            <DialogDescription>
              Record payout disbursement. You can include an optional payment reference.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label htmlFor="disburse-reference" className="text-sm font-medium text-slate-700">
              Payment Reference
            </label>
            <Input
              id="disburse-reference"
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              placeholder="UPI txn id / transfer note (optional)"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDisburseOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDisburse}
              disabled={isLoading}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {loadingAction === "disburse" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Disbursing...
                </>
              ) : (
                "Disburse"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isFailOpen} onOpenChange={setIsFailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Payout Failed</DialogTitle>
            <DialogDescription>
              Add a failure reason before moving this payout to failed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label htmlFor="failure-reason" className="text-sm font-medium text-slate-700">
              Failure Reason *
            </label>
            <Textarea
              id="failure-reason"
              rows={3}
              value={failureReason}
              onChange={(event) => setFailureReason(event.target.value)}
              placeholder="Explain what failed during disbursement"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsFailOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleMarkFailed}
              disabled={isLoading}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {loadingAction === "fail" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Mark Failed"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isVoidOpen} onOpenChange={setIsVoidOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Void Payout</DialogTitle>
            <DialogDescription>Are you sure? This cannot be undone.</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label htmlFor="void-reason" className="text-sm font-medium text-slate-700">
              Reason (optional)
            </label>
            <Textarea
              id="void-reason"
              rows={3}
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder="Add context for this void action"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsVoidOpen(false)}
              disabled={isLoading}
            >
              Go Back
            </Button>
            <Button
              type="button"
              onClick={handleVoid}
              disabled={isLoading}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              {loadingAction === "void" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Voiding...
                </>
              ) : (
                "Void"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
