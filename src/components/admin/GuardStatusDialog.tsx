"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { USER_STATUS } from "../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

const banSchema = z.object({
  reason: z.string().trim().min(1, "Reason for ban is required"),
});

const deactivateSchema = z.object({
  reason: z.string().trim().optional(),
});

type BanValues = z.infer<typeof banSchema>;
type DeactivateValues = z.infer<typeof deactivateSchema>;

type GuardStatusDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guard: {
    user_id: Id<"users">;
    name: string;
    status: string;
  };
};

function statusBadgeClassName(status: string): string {
  if (status === USER_STATUS.ACTIVE) {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (status === USER_STATUS.INACTIVE) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === USER_STATUS.BANNED) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

export function GuardStatusDialog({ open, onOpenChange, guard }: GuardStatusDialogProps) {
  const updateStatus = useMutation(api.guards.updateStatus);

  const canBeBanned = guard.status === USER_STATUS.ACTIVE || guard.status === USER_STATUS.INACTIVE;
  const inFlightItems = useQuery(
    api.guards.getInFlightItems,
    open && canBeBanned ? { user_id: guard.user_id } : "skip",
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reinstateStatus, setReinstateStatus] = useState<
    typeof USER_STATUS.ACTIVE | typeof USER_STATUS.INACTIVE
  >(USER_STATUS.ACTIVE);

  const banForm = useForm<BanValues>({
    resolver: zodResolver(banSchema),
    defaultValues: { reason: "" },
  });

  const deactivateForm = useForm<DeactivateValues>({
    resolver: zodResolver(deactivateSchema),
    defaultValues: { reason: "" },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    setReinstateStatus(USER_STATUS.ACTIVE);
    setIsSubmitting(false);
    banForm.reset();
    deactivateForm.reset();
  }, [banForm, deactivateForm, open]);

  const handleDialogClose = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);

      if (!nextOpen) {
        setIsSubmitting(false);
        banForm.reset();
        deactivateForm.reset();
      }
    },
    [banForm, deactivateForm, onOpenChange],
  );

  const isCurrentlyBanned = guard.status === USER_STATUS.BANNED;
  const canActivate = guard.status === USER_STATUS.INACTIVE;
  const canDeactivate = guard.status === USER_STATUS.ACTIVE;
  const canSubmitBan = banForm.watch("reason").trim().length > 0 && !isSubmitting;

  async function onBan(values: BanValues) {
    setIsSubmitting(true);

    try {
      await updateStatus({
        user_id: guard.user_id,
        status: USER_STATUS.BANNED,
        reason: values.reason,
      });
      toast.success("Guard banned");
      toast.info("Pending visits have been flagged for reassignment");
      handleDialogClose(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update status";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onDeactivate(values: DeactivateValues) {
    setIsSubmitting(true);

    try {
      await updateStatus({
        user_id: guard.user_id,
        status: USER_STATUS.INACTIVE,
        reason: values.reason && values.reason.length > 0 ? values.reason : undefined,
      });
      toast.success("Guard deactivated");
      handleDialogClose(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update status";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleActivate() {
    setIsSubmitting(true);

    try {
      await updateStatus({
        user_id: guard.user_id,
        status: USER_STATUS.ACTIVE,
      });
      toast.success("Guard activated");
      handleDialogClose(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update status";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReinstate() {
    setIsSubmitting(true);

    try {
      await updateStatus({
        user_id: guard.user_id,
        status: reinstateStatus,
      });
      toast.success("Status updated");
      handleDialogClose(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update status";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCurrentlyBanned ? (
              <ShieldCheck className="size-5 text-emerald-600" />
            ) : (
              <ShieldAlert className="size-5 text-slate-600" />
            )}
            Change Status
          </DialogTitle>
          <DialogDescription>
            Manage guard status for <span className="font-medium text-slate-700">{guard.name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Current status:</span>
          <Badge className={statusBadgeClassName(guard.status)}>{guard.status}</Badge>
        </div>

        {isCurrentlyBanned ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Reinstate <span className="font-medium">{guard.name}</span> and set their status to:
            </p>

            <div className="flex gap-3">
              {([USER_STATUS.ACTIVE, USER_STATUS.INACTIVE] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setReinstateStatus(status)}
                  className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                    reinstateStatus === status
                      ? status === USER_STATUS.ACTIVE
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-amber-400 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isSubmitting}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleReinstate}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Reinstating...
                  </>
                ) : (
                  "Reinstate Guard"
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {canActivate || canDeactivate || canBeBanned ? (
          <div className="space-y-4">
            {canActivate ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-800">Activate Guard</p>
                <p className="mt-1 text-sm text-emerald-700">
                  This guard can submit leads and manage assigned visits again.
                </p>
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={isSubmitting}
                    onClick={handleActivate}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Activating...
                      </>
                    ) : (
                      "Activate Guard"
                    )}
                  </Button>
                </div>
              </div>
            ) : null}

            {canDeactivate ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-800">Deactivate Guard</p>
                <p className="mt-1 text-sm text-amber-700">
                  This will prevent <span className="font-semibold">{guard.name}</span> from
                  submitting leads. They can still login.
                </p>

                <Form {...deactivateForm}>
                  <form
                    onSubmit={deactivateForm.handleSubmit(onDeactivate)}
                    className="mt-3 space-y-3"
                  >
                    <FormField
                      control={deactivateForm.control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-amber-900">Reason (optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={3}
                              placeholder="Optional note for deactivation"
                              className="border-amber-300 bg-white"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-amber-600 text-white hover:bg-amber-700"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Deactivating...
                          </>
                        ) : (
                          "Confirm Deactivate"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            ) : null}

            {canBeBanned ? (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">Ban Guard: {guard.name}</p>
                    <p className="mt-1 text-sm text-red-700">
                      This will prevent <span className="font-semibold">{guard.name}</span> from
                      logging in. Are you sure?
                    </p>
                    <p className="mt-1 text-xs font-medium text-red-700">
                      Pending visits have been flagged for reassignment.
                    </p>

                    {inFlightItems !== undefined ? (
                      <div className="mt-2 space-y-1 text-sm text-red-700">
                        <p>This guard has active items:</p>
                        <ul className="list-disc space-y-0.5 pl-5">
                          <li>
                            {inFlightItems.pending_visits} pending visit
                            {inFlightItems.pending_visits !== 1 ? "s" : ""} (flagged for
                            reassignment)
                          </li>
                          <li>
                            {inFlightItems.active_leads} active lead
                            {inFlightItems.active_leads !== 1 ? "s" : ""} (remain in current status)
                          </li>
                        </ul>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
                        <Loader2 className="size-3 animate-spin" />
                        Loading active items...
                      </div>
                    )}
                  </div>
                </div>

                <Form {...banForm}>
                  <form onSubmit={banForm.handleSubmit(onBan)} className="space-y-3">
                    <FormField
                      control={banForm.control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-red-900">Reason for ban</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={3}
                              placeholder="Explain why this guard is being banned"
                              className="border-red-300 bg-white"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end">
                      <Button type="submit" variant="destructive" disabled={!canSubmitBan}>
                        {isSubmitting ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Banning...
                          </>
                        ) : (
                          "Confirm Ban"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
