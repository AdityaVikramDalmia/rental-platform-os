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
import { DatePicker } from "@/components/ui/date-picker";

const startTransactionSchema = z.object({
  monthly_rent_rupees: z
    .string()
    .min(1, "Monthly rent is required")
    .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
      message: "Monthly rent must be greater than 0",
    }),
  deposit_rupees: z
    .string()
    .min(1, "Deposit is required")
    .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
      message: "Deposit must be greater than 0",
    }),
  move_in_date: z.string().optional(),
});

type StartTransactionValues = z.infer<typeof startTransactionSchema>;

type StartTransactionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiryId: Id<"tenant_inquiries">;
  defaultMonthlyRentPaise?: number;
  defaultDepositPaise?: number;
};

export function StartTransactionDialog({
  open,
  onOpenChange,
  inquiryId,
  defaultMonthlyRentPaise,
  defaultDepositPaise,
}: StartTransactionDialogProps) {
  const createTransaction = useMutation(api.rentalTransactions.createTransaction);

  const form = useForm<StartTransactionValues>({
    resolver: zodResolver(startTransactionSchema),
    defaultValues: {
      monthly_rent_rupees: String(Math.round((defaultMonthlyRentPaise ?? 0) / 100)),
      deposit_rupees: String(
        Math.round((defaultDepositPaise ?? defaultMonthlyRentPaise ?? 0) / 100),
      ),
      move_in_date: "",
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({
        monthly_rent_rupees: String(Math.round((defaultMonthlyRentPaise ?? 0) / 100)),
        deposit_rupees: String(
          Math.round((defaultDepositPaise ?? defaultMonthlyRentPaise ?? 0) / 100),
        ),
        move_in_date: "",
      });
    }
  }, [defaultDepositPaise, defaultMonthlyRentPaise, form, open]);

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: StartTransactionValues) {
    const monthlyRentPaise = rupeesToPaise(Number(values.monthly_rent_rupees));
    const depositPaise = rupeesToPaise(Number(values.deposit_rupees));
    const moveInDate = values.move_in_date
      ? new Date(`${values.move_in_date}T00:00:00+05:30`).getTime()
      : undefined;

    try {
      await createTransaction({
        tenant_inquiry_id: inquiryId,
        monthly_rent_paise: monthlyRentPaise,
        deposit_amount_paise: depositPaise,
        move_in_date: moveInDate,
      });
      toast.success(
        `Transaction started (${formatINR(monthlyRentPaise)} rent, ${formatINR(depositPaise)} deposit)`,
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start transaction");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start Transaction</DialogTitle>
          <DialogDescription>
            Create a post-visit transaction rail linked to this tenant inquiry.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="monthly_rent_rupees"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monthly Rent (Rs)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value} type="number" min="1" step="1" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="deposit_rupees"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deposit (Rs)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value} type="number" min="1" step="1" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="move_in_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Move-in Date (optional)</FormLabel>
                  <FormControl>
                    <DatePicker value={field.value ?? ""} onChange={field.onChange} />
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
                    Starting...
                  </>
                ) : (
                  "Start Transaction"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
