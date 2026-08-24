"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { ClipboardPenLine, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  RM_CHECK_IN_METHOD,
  RM_CHECK_IN_OUTCOME,
  RM_CHECK_IN_TYPE,
} from "../../../../lib/constants";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CHECK_IN_TYPE_OPTIONS = [
  { value: RM_CHECK_IN_TYPE.SCHEDULED, label: "Scheduled" },
  { value: RM_CHECK_IN_TYPE.ISSUE, label: "Issue" },
  { value: RM_CHECK_IN_TYPE.RE_LISTING, label: "Re-listing" },
  { value: RM_CHECK_IN_TYPE.OWNER_INITIATED, label: "Owner Initiated" },
  { value: RM_CHECK_IN_TYPE.AD_HOC, label: "Ad Hoc" },
] as const;

const METHOD_OPTIONS = [
  { value: RM_CHECK_IN_METHOD.CALL, label: "Call" },
  { value: RM_CHECK_IN_METHOD.WHATSAPP, label: "WhatsApp" },
  { value: RM_CHECK_IN_METHOD.IN_PERSON, label: "In Person" },
  { value: RM_CHECK_IN_METHOD.OTHER, label: "Other" },
] as const;

const OUTCOME_OPTIONS = [
  { value: RM_CHECK_IN_OUTCOME.RESOLVED, label: "Resolved" },
  { value: RM_CHECK_IN_OUTCOME.PENDING, label: "Pending" },
  { value: RM_CHECK_IN_OUTCOME.ESCALATED, label: "Escalated" },
] as const;

const SATISFACTION_OPTIONS = [
  { value: "1", label: "1 - Very Unsatisfied" },
  { value: "2", label: "2 - Unsatisfied" },
  { value: "3", label: "3 - Neutral" },
  { value: "4", label: "4 - Satisfied" },
  { value: "5", label: "5 - Very Satisfied" },
] as const;

const checkInSchema = z.object({
  check_in_type: z.string().min(1, "Check-in type is required"),
  method: z.string().min(1, "Method is required"),
  summary: z.string().trim().min(1, "Summary is required"),
  outcome: z.string().min(1, "Outcome is required"),
  owner_satisfaction: z.string().optional(),
});

type CheckInValues = z.infer<typeof checkInSchema>;

type CheckInDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: Id<"owner_rm_assignments">;
  ownerName: string;
};

export function CheckInDialog({ open, onOpenChange, assignmentId, ownerName }: CheckInDialogProps) {
  const createCheckIn = useMutation(api.rmAssignments.createCheckIn);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CheckInValues>({
    resolver: zodResolver(checkInSchema),
    defaultValues: {
      check_in_type: "",
      method: "",
      summary: "",
      outcome: "",
      owner_satisfaction: undefined,
    },
  });

  useEffect(() => {
    if (!open) return;
    setIsSubmitting(false);
    form.reset();
  }, [form, open]);

  const handleDialogClose = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        setIsSubmitting(false);
        form.reset();
      }
    },
    [form, onOpenChange],
  );

  async function onSubmit(values: CheckInValues) {
    setIsSubmitting(true);
    try {
      const satisfaction = values.owner_satisfaction
        ? Number.parseInt(values.owner_satisfaction, 10)
        : undefined;

      await createCheckIn({
        assignment_id: assignmentId,
        check_in_type:
          values.check_in_type as (typeof RM_CHECK_IN_TYPE)[keyof typeof RM_CHECK_IN_TYPE],
        method: values.method as (typeof RM_CHECK_IN_METHOD)[keyof typeof RM_CHECK_IN_METHOD],
        summary: values.summary,
        outcome: values.outcome as (typeof RM_CHECK_IN_OUTCOME)[keyof typeof RM_CHECK_IN_OUTCOME],
        owner_satisfaction: satisfaction,
      });
      toast.success("Check-in recorded");
      handleDialogClose(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to record check-in";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPenLine className="size-5 text-slate-600" />
            Log Check-in
          </DialogTitle>
          <DialogDescription>
            Record a check-in for owner{" "}
            <span className="font-medium text-slate-700">{ownerName}</span>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="check_in_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CHECK_IN_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {METHOD_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="summary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Summary</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Brief summary of the check-in conversation"
                      className="border-slate-300"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="outcome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Outcome</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select outcome" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {OUTCOME_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="owner_satisfaction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Satisfaction (optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Rate 1-5" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SATISFACTION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Recording...
                  </>
                ) : (
                  "Record Check-in"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
