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
import { formatINR, rupeesToPaise } from "../../../../../../lib/money";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const postBountySchema = z.object({
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) > 0, {
      message: "Amount must be greater than 0",
    }),
  expiry_days: z
    .string()
    .min(1, "Expiry days is required")
    .refine(
      (value) => {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30;
      },
      {
        message: "Expiry days must be an integer between 1 and 30",
      },
    ),
  ops_notes: z.string().optional(),
});

type PostBountyValues = z.infer<typeof postBountySchema>;

type PostBountyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiryId: Id<"tenant_inquiries">;
};

export function PostBountyDialog({ open, onOpenChange, inquiryId }: PostBountyDialogProps) {
  const postBounty = useMutation(api.tenantInquiries.postBounty);

  const form = useForm<PostBountyValues>({
    resolver: zodResolver(postBountySchema),
    defaultValues: {
      amount: "500",
      expiry_days: "3",
      ops_notes: "",
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({ amount: "500", expiry_days: "3", ops_notes: "" });
    }
  }, [form, open]);

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: PostBountyValues) {
    const amountInPaise = rupeesToPaise(Number(values.amount));
    const expiryDays = Number(values.expiry_days);
    try {
      await postBounty({
        id: inquiryId,
        bounty_amount: amountInPaise,
        expiry_days: expiryDays,
      });
      toast.success(`Bounty posted: ${formatINR(amountInPaise)}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to post bounty");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Post Bounty</DialogTitle>
          <DialogDescription>
            Set a bounty amount and expiry window for guards to claim this inquiry.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bounty Amount (₹)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value}
                      type="number"
                      min="1"
                      step="1"
                      placeholder="e.g., 500"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expiry_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expiry Days</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value} type="number" min="1" max="30" step="1" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ops_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={3}
                      placeholder="Add context for internal ops follow-up"
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
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Posting...
                  </>
                ) : (
                  "Post Bounty"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
