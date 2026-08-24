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
import { formatINR, paiseToRupees, rupeesToPaise } from "../../../../../../lib/money";
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

const setBountySchema = z.object({
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
      message: "Amount must be a positive number",
    }),
});

type SetBountyValues = z.infer<typeof setBountySchema>;

type SetBountyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: Id<"leads">;
  existingBounty?: number;
};

export function SetBountyDialog({
  open,
  onOpenChange,
  leadId,
  existingBounty,
}: SetBountyDialogProps) {
  const setBounty = useMutation(api.leads.setBounty);

  const form = useForm<SetBountyValues>({
    resolver: zodResolver(setBountySchema),
    defaultValues: {
      amount: existingBounty ? paiseToRupees(existingBounty).toString() : "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        amount: existingBounty ? paiseToRupees(existingBounty).toString() : "",
      });
    }
  }, [existingBounty, form, open]);

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: SetBountyValues) {
    const rupees = Number(values.amount);
    const paise = rupeesToPaise(rupees);

    try {
      await setBounty({ lead_id: leadId, amount: paise });
      toast.success(`Bounty set — ${formatINR(paise)}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to set bounty");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set Prospective Bounty</DialogTitle>
          <DialogDescription>
            Set the bounty amount guards will see once this lead is verified.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (&#8377;)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min="1"
                      step="1"
                      placeholder="e.g., 25000"
                      className="h-10 border-slate-300"
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
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Set Bounty"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
