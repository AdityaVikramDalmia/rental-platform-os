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

const dropSchema = z.object({
  ops_notes: z.string().trim().min(1, "Reason is required").max(500, "Reason is too long"),
});

type DropFormValues = z.infer<typeof dropSchema>;

type DropDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: Id<"owner_service_requests">;
};

export function DropDialog({ open, onOpenChange, requestId }: DropDialogProps) {
  const updateStatus = useMutation(api.ownerServiceRequests.updateStatus);
  const form = useForm<DropFormValues>({
    resolver: zodResolver(dropSchema),
    defaultValues: {
      ops_notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({ ops_notes: "" });
    }
  }, [form, open]);

  const onSubmit = async (values: DropFormValues) => {
    try {
      await updateStatus({
        id: requestId,
        status: "DROPPED",
        ops_notes: values.ops_notes,
      });
      toast.success("Request dropped.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to drop request");
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Drop Request</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className="space-y-3 py-2">
              <p className="text-sm text-slate-600">
                Dropping marks this owner as no longer being pursued after initial contact.
              </p>
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
                        placeholder="e.g. Owner changed mind, not interested in management services..."
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
              <Button
                type="submit"
                variant="outline"
                className="border-slate-300 text-slate-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Dropping..." : "Drop Request"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
