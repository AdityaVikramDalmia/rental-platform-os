"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { formatRelativeTime } from "../../../../../../lib/dates";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";
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

const markDuplicateSchema = z.object({
  reason: z.string().optional(),
});

type MarkDuplicateValues = z.infer<typeof markDuplicateSchema>;

type DuplicateLeadRef = {
  lead_id: string;
  flat_number: string;
  status: string;
  created_at: number;
};

type MarkDuplicateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: Id<"leads">;
  originalLeadId?: Id<"leads">;
  duplicateLead?: DuplicateLeadRef | null;
  mode: "mark" | "clear";
};

export function MarkDuplicateDialog({
  open,
  onOpenChange,
  leadId,
  originalLeadId,
  duplicateLead,
  mode,
}: MarkDuplicateDialogProps) {
  const markDuplicate = useMutation(api.leads.markDuplicate);
  const clearDuplicateFlag = useMutation(api.leads.clearDuplicateFlag);

  const form = useForm<MarkDuplicateValues>({
    resolver: zodResolver(markDuplicateSchema),
    defaultValues: { reason: "" },
  });

  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [form, open]);

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmitMark(values: MarkDuplicateValues) {
    if (!originalLeadId) {
      toast.error("No original lead reference found");
      return;
    }

    try {
      await markDuplicate({
        lead_id: leadId,
        original_lead_id: originalLeadId,
        reason: values.reason?.trim() || undefined,
      });
      toast.success("Lead marked as duplicate");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark as duplicate");
    }
  }

  async function onSubmitClear() {
    try {
      await clearDuplicateFlag({ lead_id: leadId });
      toast.success("Duplicate flag cleared — lead is back in queue");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clear duplicate flag");
    }
  }

  if (mode === "clear") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear Duplicate Flag</DialogTitle>
            <DialogDescription>
              Clear the duplicate flag? This lead will move back to the SUBMITTED queue for review.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSubmitClear}
              disabled={isSubmitting}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Clearing...
                </>
              ) : (
                "Clear Flag"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as Duplicate</DialogTitle>
          <DialogDescription>
            Confirm this lead is a duplicate of an existing lead.
          </DialogDescription>
        </DialogHeader>

        {duplicateLead && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Duplicate of:</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm font-medium text-slate-900">
                Flat {duplicateLead.flat_number}
              </span>
              <LeadStatusBadge status={duplicateLead.status} size="sm" />
              <span className="text-xs text-slate-400">
                {formatRelativeTime(duplicateLead.created_at)}
              </span>
            </div>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitMark)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      placeholder="Additional context about why this is a duplicate..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Marking...
                  </>
                ) : (
                  "Mark Duplicate"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
