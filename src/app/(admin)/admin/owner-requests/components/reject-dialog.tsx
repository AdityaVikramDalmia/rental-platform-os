"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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

const rejectSchema = z.object({
  ops_notes: z.string().trim().min(1, "Reason is required").max(500, "Reason is too long"),
});

type RejectFormValues = z.infer<typeof rejectSchema>;

type RejectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: Id<"owner_service_requests">;
};

export function RejectDialog({ open, onOpenChange, requestId }: RejectDialogProps) {
  const updateStatus = useMutation(api.ownerServiceRequests.updateStatus);
  const form = useForm<RejectFormValues>({
    resolver: zodResolver(rejectSchema),
    defaultValues: {
      ops_notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({ ops_notes: "" });
    }
  }, [form, open]);

  const onSubmit = async (values: RejectFormValues) => {
    try {
      await updateStatus({
        id: requestId,
        status: "REJECTED",
        ops_notes: values.ops_notes,
      });
      toast.success("Request rejected.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject request");
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Request</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className="space-y-3 py-2">
              <FormField
                control={form.control}
                name="ops_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Reason <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g. Property outside service area, owner not responsive..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={isSubmitting}>
                {isSubmitting ? "Rejecting..." : "Reject Request"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
