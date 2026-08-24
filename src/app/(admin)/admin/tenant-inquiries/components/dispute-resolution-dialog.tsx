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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const disputeSchema = z.object({
  resolved_value: z.string().min(1, "Resolved value is required"),
  resolution_notes: z
    .string()
    .min(1, "Resolution notes are required")
    .max(2000, "Resolution notes must be 2000 characters or less"),
});

type DisputeValues = z.infer<typeof disputeSchema>;

type DisputeItem = {
  item_id: string;
  term_type: string;
  description: string;
  extracted_value?: string;
  admin_edited_value?: string;
  tenant_comment?: string;
  owner_comment?: string;
  tenant_status?: string;
  owner_status?: string;
};

type DisputeResolutionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checklistId: Id<"deal_checklists">;
  item: DisputeItem;
};

const TERM_TYPE_LABELS: Record<string, string> = {
  RENT_AMOUNT: "Rent Amount",
  DEPOSIT: "Security Deposit",
  LEASE_DURATION: "Lease Duration",
  MOVE_IN_DATE: "Move-in Date",
  MAINTENANCE: "Maintenance",
  ESCALATION_CLAUSE: "Escalation Clause",
  FURNISHING: "Furnishing",
  LOCK_IN_PERIOD: "Lock-in Period",
  NOTICE_PERIOD: "Notice Period",
  BROKERAGE: "Brokerage",
  CUSTOM: "Custom Term",
};

const TERM_TYPE_EMOJIS: Record<string, string> = {
  RENT_AMOUNT: "💰",
  DEPOSIT: "🏦",
  LEASE_DURATION: "📅",
  MOVE_IN_DATE: "🗓️",
  MAINTENANCE: "🔧",
  ESCALATION_CLAUSE: "📈",
  FURNISHING: "🛋️",
  LOCK_IN_PERIOD: "🔒",
  NOTICE_PERIOD: "📋",
  BROKERAGE: "🤝",
  CUSTOM: "⚙️",
};

export function DisputeResolutionDialog({
  open,
  onOpenChange,
  checklistId,
  item,
}: DisputeResolutionDialogProps) {
  const resolveDispute = useMutation(api.dealChecklistApprovals.resolveDispute);

  const form = useForm<DisputeValues>({
    resolver: zodResolver(disputeSchema),
    defaultValues: {
      resolved_value: item.admin_edited_value ?? item.extracted_value ?? "",
      resolution_notes: "",
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({
        resolved_value: item.admin_edited_value ?? item.extracted_value ?? "",
        resolution_notes: "",
      });
    }
  }, [form, open, item.admin_edited_value, item.extracted_value]);

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: DisputeValues) {
    try {
      await resolveDispute({
        checklist_id: checklistId,
        item_id: item.item_id,
        resolved_value: values.resolved_value.trim(),
        resolution_notes: values.resolution_notes.trim(),
      });
      toast.success("Dispute resolved — both parties will re-review");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resolve dispute");
    }
  }

  const termLabel = TERM_TYPE_LABELS[item.term_type] ?? item.term_type;
  const termEmoji = TERM_TYPE_EMOJIS[item.term_type] ?? "📝";
  const currentValue = item.admin_edited_value ?? item.extracted_value;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="size-4 text-amber-600" />
            </div>
            Resolve Dispute
          </DialogTitle>
          <DialogDescription>
            Provide a resolved value and explain the decision. Both parties will need to re-review
            this item.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">{termEmoji}</span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {termLabel}
            </span>
          </div>
          <p className="text-sm text-slate-700">{item.description}</p>
          {currentValue && (
            <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                Current Value
              </span>
              <p className="text-sm font-semibold text-slate-900">{currentValue}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            {item.tenant_status && item.tenant_status !== "PENDING" && (
              <div className="rounded-md border border-rose-100 bg-rose-50/50 px-2.5 py-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  Tenant
                </span>
                <p className="text-xs font-semibold text-rose-700">{item.tenant_status}</p>
                {item.tenant_comment && (
                  <p className="mt-0.5 text-[11px] text-slate-500 italic">
                    &ldquo;{item.tenant_comment}&rdquo;
                  </p>
                )}
              </div>
            )}
            {item.owner_status && item.owner_status !== "PENDING" && (
              <div className="rounded-md border border-rose-100 bg-rose-50/50 px-2.5 py-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  Owner
                </span>
                <p className="text-xs font-semibold text-rose-700">{item.owner_status}</p>
                {item.owner_comment && (
                  <p className="mt-0.5 text-[11px] text-slate-500 italic">
                    &ldquo;{item.owner_comment}&rdquo;
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="resolved_value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resolved Value</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter the resolved value for this term" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="resolution_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resolution Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      placeholder="Explain the decision and reasoning behind this resolution"
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
                className="border-amber-300 bg-amber-500 text-white hover:bg-amber-600"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Resolving...
                  </>
                ) : (
                  "Resolve Dispute"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
