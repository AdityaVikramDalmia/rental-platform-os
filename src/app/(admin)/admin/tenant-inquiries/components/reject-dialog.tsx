"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { AlertTriangle, Loader2 } from "lucide-react";
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

const rejectSchema = z.object({
  ops_notes: z.string().trim().min(1, "Ops notes are required"),
});

type RejectValues = z.infer<typeof rejectSchema>;

type RejectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiryId: Id<"tenant_inquiries">;
};

export function RejectDialog({ open, onOpenChange, inquiryId }: RejectDialogProps) {
  const rejectInquiry = useMutation(api.tenantInquiries.reject);

  const form = useForm<RejectValues>({
    resolver: zodResolver(rejectSchema),
    defaultValues: { ops_notes: "" },
  });

  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [form, open]);

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: RejectValues) {
    try {
      await rejectInquiry({
        id: inquiryId,
        ops_notes: values.ops_notes.trim(),
      });
      toast.success("Inquiry rejected");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject inquiry");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Inquiry</DialogTitle>
          <DialogDescription>
            Provide a reason before rejecting this tenant inquiry.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="size-4 shrink-0" />
          This marks the inquiry as rejected and cannot be undone.
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="ops_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ops notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={4}
                      placeholder="e.g., Listing no longer available for visits"
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
                    Rejecting...
                  </>
                ) : (
                  "Reject Inquiry"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
