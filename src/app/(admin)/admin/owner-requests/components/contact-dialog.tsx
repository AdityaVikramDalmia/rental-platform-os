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

const contactSchema = z.object({
  ops_notes: z
    .string()
    .trim()
    .max(500, "Notes cannot exceed 500 characters")
    .optional()
    .or(z.literal("")),
});

type ContactFormValues = z.infer<typeof contactSchema>;

type ContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: Id<"owner_service_requests">;
};

export function ContactDialog({ open, onOpenChange, requestId }: ContactDialogProps) {
  const updateStatus = useMutation(api.ownerServiceRequests.updateStatus);
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      ops_notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({ ops_notes: "" });
    }
  }, [form, open]);

  const onSubmit = async (values: ContactFormValues) => {
    try {
      await updateStatus({
        id: requestId,
        status: "CONTACTED",
        ops_notes: values.ops_notes?.trim() || undefined,
      });
      toast.success("Owner marked as contacted.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as Contacted</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className="space-y-3 py-2">
              <FormField
                control={form.control}
                name="ops_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g. Called owner, interested in full management package..."
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
                disabled={isSubmitting}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {isSubmitting ? "Saving..." : "Mark as Contacted"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
