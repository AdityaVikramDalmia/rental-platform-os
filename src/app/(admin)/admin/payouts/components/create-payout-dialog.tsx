"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { CLOSURE_STATUS } from "../../../../../../lib/constants";
import { formatINR, rupeesToPaise } from "../../../../../../lib/money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const createPayoutSchema = z.object({
  closure_id: z.string().min(1, "Select a confirmed closure"),
  amount_rupees: z
    .string()
    .min(1, "Payout amount is required")
    .refine((value) => {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) && numericValue > 0;
    }, "Payout amount must be greater than 0"),
  payment_reference: z.string().optional(),
});

type CreatePayoutFormValues = z.infer<typeof createPayoutSchema>;

type CreatePayoutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialClosureId?: Id<"closures">;
};

export function CreatePayoutDialog({
  open,
  onOpenChange,
  initialClosureId,
}: CreatePayoutDialogProps) {
  const createPayout = useMutation(api.payouts.create);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confirmedClosures = useQuery(
    api.closures.list,
    open && !initialClosureId
      ? {
          paginationOpts: { numItems: 200, cursor: null },
          status: CLOSURE_STATUS.CONFIRMED,
        }
      : "skip",
  );

  const availableClosures = useMemo(() => {
    return (confirmedClosures?.page ?? []).filter(
      (closure) => closure.status === CLOSURE_STATUS.CONFIRMED && !closure.payout_status,
    );
  }, [confirmedClosures]);

  const form = useForm<CreatePayoutFormValues>({
    resolver: zodResolver(createPayoutSchema),
    defaultValues: {
      closure_id: initialClosureId ?? "",
      amount_rupees: "",
      payment_reference: "",
    },
  });

  const watchedClosureId = form.watch("closure_id");
  const selectedClosureId = (initialClosureId ?? watchedClosureId) as Id<"closures"> | undefined;

  const selectedClosureDetails = useQuery(
    api.closures.getById,
    selectedClosureId ? { id: selectedClosureId } : "skip",
  );

  const selectedClosureFromBoardList = useMemo(() => {
    if (!selectedClosureId) {
      return null;
    }

    return availableClosures.find((closure) => closure._id === selectedClosureId) ?? null;
  }, [availableClosures, selectedClosureId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset({
      closure_id: initialClosureId ?? "",
      amount_rupees: "",
      payment_reference: "",
    });
  }, [form, initialClosureId, open]);

  const guardName =
    selectedClosureDetails?.guard?.name ?? selectedClosureFromBoardList?.guard?.name ?? "—";
  const buildingName =
    selectedClosureDetails?.building?.name ?? selectedClosureFromBoardList?.building?.name ?? "—";
  const flatNumber =
    selectedClosureDetails?.lead?.flat_number ??
    selectedClosureFromBoardList?.lead?.flat_number ??
    "—";
  const societyName =
    selectedClosureDetails?.society?.name ?? selectedClosureFromBoardList?.society?.name ?? "—";
  const prospectiveBounty =
    selectedClosureDetails?.lead?.prospective_bounty ??
    selectedClosureFromBoardList?.lead?.prospective_bounty;

  const hasExistingPayout =
    Boolean(selectedClosureDetails?.payout) || Boolean(selectedClosureFromBoardList?.payout_status);

  async function onSubmit(values: CreatePayoutFormValues) {
    const closureId = (initialClosureId ?? values.closure_id) as Id<"closures"> | undefined;

    if (!closureId) {
      return;
    }

    setIsSubmitting(true);
    try {
      await createPayout({
        closure_id: closureId,
        amount_paise: rupeesToPaise(Number(values.amount_rupees)),
        payment_reference: values.payment_reference?.trim() || undefined,
      });

      toast.success("Payout created!");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create payout");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Payout</DialogTitle>
          <DialogDescription>
            Create a payout for a confirmed closure. Amount is entered manually and stored in paise.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {initialClosureId ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Closure</p>
                <p className="text-sm font-medium text-slate-800">{initialClosureId}</p>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="closure_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Closure *</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a confirmed closure..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableClosures.map((closure) => (
                            <SelectItem key={closure._id} value={closure._id}>
                              {closure.building?.name ?? "—"} / {closure.lead?.flat_number ?? "—"} —{" "}
                              {closure.society?.name ?? "—"} ({closure.guard?.name ?? "—"})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div>
                <p className="text-slate-500">Guard</p>
                <p className="font-medium text-slate-900">{guardName}</p>
              </div>
              <div>
                <p className="text-slate-500">Lead</p>
                <p className="font-medium text-slate-900">
                  {buildingName} / {flatNumber}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Society</p>
                <p className="font-medium text-slate-900">{societyName}</p>
              </div>
              <div>
                <p className="text-slate-500">Closure Reference</p>
                <p className="font-medium text-slate-900">{selectedClosureId ?? "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-500">Prospective Bounty (reference only)</p>
                <p className="font-medium text-slate-900">
                  {prospectiveBounty !== undefined ? formatINR(prospectiveBounty) : "—"}
                </p>
              </div>
            </div>

            {hasExistingPayout && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                A payout already exists for this closure.
              </div>
            )}

            <FormField
              control={form.control}
              name="amount_rupees"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payout Amount (₹) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Enter payout amount"
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="payment_reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Reference</FormLabel>
                  <FormControl>
                    <Input placeholder="UPI txn id / transfer note (optional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !selectedClosureId || hasExistingPayout}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Payout"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
