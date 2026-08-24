"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { formatDateTime } from "../../../../../../lib/dates";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const dismissSchema = z.object({
  reason: z.string().trim().min(5, "Reason must be at least 5 characters"),
});

type DismissValues = z.infer<typeof dismissSchema>;

type NegotiationFlagsProps = {
  negotiationId: Id<"negotiations">;
  flags?: {
    is_stale: boolean;
    too_many_rounds: boolean;
    token_without_agreement: boolean;
  };
  flagDismissedAt?: number;
  flagDismissedReason?: string;
  canManage: boolean;
};

export function NegotiationFlags({
  negotiationId,
  flags,
  flagDismissedAt,
  flagDismissedReason,
  canManage,
}: NegotiationFlagsProps) {
  const detail = useQuery(
    api.negotiations.getDetailForAdmin,
    flags ? "skip" : { negotiation_id: negotiationId },
  );
  const currentUser = useQuery(api.users.getCurrentUser);
  const dismissEscalationFlag = useMutation(api.negotiations.dismissEscalationFlag);

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<DismissValues>({
    resolver: zodResolver(dismissSchema),
    defaultValues: { reason: "" },
  });

  useEffect(() => {
    if (!isDialogOpen) {
      form.reset();
    }
  }, [form, isDialogOpen]);

  if (!flags && detail === undefined) {
    return (
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">Escalation Flags</p>
        <p className="text-sm text-slate-500">Loading flags...</p>
      </div>
    );
  }

  if (!flags && detail === null) {
    return null;
  }

  const resolvedFlags = flags ?? detail?.flags;
  if (!resolvedFlags) {
    return null;
  }

  const resolvedDismissedAt = flagDismissedAt ?? detail?.negotiation.flag_dismissed_at;
  const resolvedDismissedReason = flagDismissedReason ?? detail?.negotiation.flag_dismissed_reason;

  const hasActiveFlags =
    resolvedFlags.is_stale ||
    resolvedFlags.too_many_rounds ||
    resolvedFlags.token_without_agreement;
  const isDismissed = resolvedDismissedAt !== undefined;
  const canDismiss =
    (currentUser?.user_types?.includes("ADMIN") ?? currentUser?.user_type === "ADMIN") && canManage;

  async function onSubmit(values: DismissValues) {
    try {
      await dismissEscalationFlag({
        negotiation_id: negotiationId,
        reason: values.reason.trim(),
      });
      toast.success("Escalation flags dismissed");
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to dismiss flags");
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Escalation Flags</p>
        {canDismiss && hasActiveFlags ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setIsDialogOpen(true)}>
            Dismiss All Flags
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {resolvedFlags.is_stale ? (
          <Badge variant="secondary" className="bg-red-100 font-semibold text-red-700">
            🔴 Stale
          </Badge>
        ) : null}
        {resolvedFlags.too_many_rounds ? (
          <Badge variant="secondary" className="bg-amber-100 font-semibold text-amber-800">
            🟡 Too Many Rounds
          </Badge>
        ) : null}
        {resolvedFlags.token_without_agreement ? (
          <Badge variant="secondary" className="bg-orange-100 font-semibold text-orange-700">
            🟠 Token w/o Agreement
          </Badge>
        ) : null}

        {isDismissed ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="bg-slate-100 font-semibold text-slate-600">
                  Dismissed
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                <p>{resolvedDismissedReason ?? "No reason provided"}</p>
                <p className="mt-1 opacity-90">
                  {formatDateTime(resolvedDismissedAt as number)}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}

        {!hasActiveFlags && !isDismissed ? (
          <Badge variant="secondary" className="bg-slate-100 font-semibold text-slate-600">
            No Active Flags
          </Badge>
        ) : null}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss Escalation Flags</DialogTitle>
            <DialogDescription>
              This marks all current escalation flags as dismissed for this negotiation.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dismissal reason</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={4}
                        placeholder="Add why these flags are being dismissed"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Dismissing...
                    </>
                  ) : (
                    "Dismiss All Flags"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
