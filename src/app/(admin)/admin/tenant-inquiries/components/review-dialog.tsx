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

const reviewSchema = z.object({
  ops_notes: z.string().max(1200, "Ops notes must be 1200 characters or less").optional(),
});

type ReviewValues = z.infer<typeof reviewSchema>;

type ReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiryId: Id<"tenant_inquiries">;
};

export function ReviewDialog({ open, onOpenChange, inquiryId }: ReviewDialogProps) {
  const reviewInquiry = useMutation(api.tenantInquiries.review);

  const form = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { ops_notes: "" },
  });

  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [form, open]);

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: ReviewValues) {
    try {
      const opsNotes = values.ops_notes?.trim();
      await reviewInquiry({
        id: inquiryId,
        ops_notes: opsNotes && opsNotes.length > 0 ? opsNotes : undefined,
      });
      toast.success("Inquiry reviewed");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to review inquiry");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review Inquiry</DialogTitle>
          <DialogDescription>
            Confirm this inquiry is valid before posting a bounty or scheduling follow-up actions.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="ops_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ops Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={4}
                      value={field.value ?? ""}
                      placeholder="Add internal context for reviewers"
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Reviewing...
                  </>
                ) : (
                  "Confirm Review"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
