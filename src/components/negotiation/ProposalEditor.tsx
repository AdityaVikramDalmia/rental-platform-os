"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MAINTENANCE_PAID_BY, RENT_ESCALATION_TYPE } from "../../../lib/constants";
import { rupeesToPaise } from "../../../lib/money";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Textarea } from "@/components/ui/textarea";

const nonNegativeNumberString = z
  .string()
  .min(1, "Value is required")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, {
    message: "Must be non-negative",
  });

const nonNegativeIntegerString = z
  .string()
  .min(1, "Value is required")
  .refine((value) => Number.isInteger(Number(value)) && Number(value) >= 0, {
    message: "Must be a non-negative whole number",
  });

const proposalFormSchema = z.object({
  monthly_rent_rupees: nonNegativeNumberString,
  security_deposit_rupees: nonNegativeNumberString,
  security_deposit_months: nonNegativeIntegerString,
  lock_in_period_months: nonNegativeIntegerString,
  notice_period_months: nonNegativeIntegerString,
  move_in_date: z.string().min(1, "Move-in date is required"),
  maintenance_charges_rupees: nonNegativeNumberString,
  maintenance_paid_by: z.enum([
    MAINTENANCE_PAID_BY.TENANT,
    MAINTENANCE_PAID_BY.OWNER,
    MAINTENANCE_PAID_BY.SPLIT,
  ]),
  rent_escalation_type: z.enum([
    RENT_ESCALATION_TYPE.PERCENTAGE,
    RENT_ESCALATION_TYPE.FIXED_AMOUNT,
    RENT_ESCALATION_TYPE.NONE,
  ]),
  rent_escalation_value: nonNegativeNumberString,
  furnishing_terms: z.string().trim().min(1, "Furnishing terms are required"),
  brokerage_tenant_side_rupees: nonNegativeNumberString,
  brokerage_owner_side_rupees: nonNegativeNumberString,
  token_advance_amount_rupees: nonNegativeNumberString,
  special_conditions: z.string().optional(),
});

type ProposalFormValues = {
  monthly_rent_rupees: string;
  security_deposit_rupees: string;
  security_deposit_months: string;
  lock_in_period_months: string;
  notice_period_months: string;
  move_in_date: string;
  maintenance_charges_rupees: string;
  maintenance_paid_by: "TENANT" | "OWNER" | "SPLIT";
  rent_escalation_type: "PERCENTAGE" | "FIXED_AMOUNT" | "NONE";
  rent_escalation_value: string;
  furnishing_terms: string;
  brokerage_tenant_side_rupees: string;
  brokerage_owner_side_rupees: string;
  token_advance_amount_rupees: string;
  special_conditions?: string;
};

interface ProposalEditorProps {
  negotiationId: Id<"negotiations">;
  initialValues?: Partial<ProposalFormValues>;
  proposalId?: Id<"negotiation_terms_proposals">;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const defaultValues: ProposalFormValues = {
  monthly_rent_rupees: "0",
  security_deposit_rupees: "0",
  security_deposit_months: "0",
  lock_in_period_months: "0",
  notice_period_months: "0",
  move_in_date: "",
  maintenance_charges_rupees: "0",
  maintenance_paid_by: MAINTENANCE_PAID_BY.TENANT,
  rent_escalation_type: RENT_ESCALATION_TYPE.NONE,
  rent_escalation_value: "0",
  furnishing_terms: "",
  brokerage_tenant_side_rupees: "0",
  brokerage_owner_side_rupees: "0",
  token_advance_amount_rupees: "0",
  special_conditions: "",
};

function toUnixMs(yyyyMmDd: string): number {
  return new Date(`${yyyyMmDd}T00:00:00+05:30`).getTime();
}

export function ProposalEditor({
  negotiationId,
  initialValues,
  proposalId,
  onSuccess,
  onCancel,
}: ProposalEditorProps) {
  const createProposal = useMutation(api.negotiationProposals.create);
  const editProposal = useMutation(api.negotiationProposals.edit);

  const normalizedInitialValues = useMemo(() => {
    if (!initialValues) {
      return undefined;
    }

    const normalizedValues: Partial<ProposalFormValues> = {
      ...initialValues,
    };

    if (
      initialValues.rent_escalation_type === RENT_ESCALATION_TYPE.FIXED_AMOUNT &&
      initialValues.rent_escalation_value !== undefined
    ) {
      const fixedEscalationPaise = Number(initialValues.rent_escalation_value);
      if (Number.isFinite(fixedEscalationPaise)) {
        // Fixed escalation is stored in paise in Convex but entered in rupees in this form.
        normalizedValues.rent_escalation_value = String(fixedEscalationPaise / 100);
      }
    }

    return normalizedValues;
  }, [initialValues]);

  const form = useForm<ProposalFormValues>({
    resolver: zodResolver(proposalFormSchema) as Resolver<ProposalFormValues>,
    defaultValues: {
      ...defaultValues,
      ...normalizedInitialValues,
    },
  });

  const escalationType = useWatch({ control: form.control, name: "rent_escalation_type" });

  useEffect(() => {
    form.reset({
      ...defaultValues,
      ...normalizedInitialValues,
    });
  }, [form, normalizedInitialValues]);

  const isSubmitting = form.formState.isSubmitting;
  const isEditMode = Boolean(proposalId);

  async function onSubmit(values: ProposalFormValues) {
    const monthlyRentRupees = Number(values.monthly_rent_rupees);
    const securityDepositRupees = Number(values.security_deposit_rupees);
    const securityDepositMonths = Number(values.security_deposit_months);
    const lockInPeriodMonths = Number(values.lock_in_period_months);
    const noticePeriodMonths = Number(values.notice_period_months);
    const maintenanceChargesRupees = Number(values.maintenance_charges_rupees);
    const escalationValue = Number(values.rent_escalation_value);
    const escalationValueForPayload =
      values.rent_escalation_type === RENT_ESCALATION_TYPE.FIXED_AMOUNT
        ? rupeesToPaise(escalationValue)
        : escalationValue;
    const brokerageTenantRupees = Number(values.brokerage_tenant_side_rupees);
    const brokerageOwnerRupees = Number(values.brokerage_owner_side_rupees);
    const tokenAdvanceRupees = Number(values.token_advance_amount_rupees);

    const payload = {
      monthly_rent_paise: rupeesToPaise(monthlyRentRupees),
      security_deposit_paise: rupeesToPaise(securityDepositRupees),
      security_deposit_months: Math.round(securityDepositMonths),
      lock_in_period_months: Math.round(lockInPeriodMonths),
      notice_period_months: Math.round(noticePeriodMonths),
      move_in_date: toUnixMs(values.move_in_date),
      maintenance_charges_paise: rupeesToPaise(maintenanceChargesRupees),
      maintenance_paid_by: values.maintenance_paid_by,
      rent_escalation_type: values.rent_escalation_type,
      rent_escalation_value: escalationValueForPayload,
      furnishing_terms: values.furnishing_terms,
      brokerage_tenant_side_paise: rupeesToPaise(brokerageTenantRupees),
      brokerage_owner_side_paise: rupeesToPaise(brokerageOwnerRupees),
      token_advance_amount_paise: rupeesToPaise(tokenAdvanceRupees),
      special_conditions: values.special_conditions?.trim() || undefined,
    };

    try {
      if (proposalId) {
        await editProposal({
          proposal_id: proposalId,
          ...payload,
          special_conditions: values.special_conditions?.trim() ?? "",
        });
        toast.success("Proposal updated");
      } else {
        await createProposal({
          negotiation_id: negotiationId,
          ...payload,
        });
        toast.success("Proposal created");
      }

      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save proposal");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="monthly_rent_rupees"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monthly Rent (Rs)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="0" step="1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="security_deposit_rupees"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Security Deposit (Rs)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="0" step="1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="security_deposit_months"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Security Deposit Months</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="0" step="1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="lock_in_period_months"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lock-in Period (months)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="0" step="1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notice_period_months"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notice Period (months)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="0" step="1" />
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
                <FormLabel>Move-in Date</FormLabel>
                <FormControl>
                  <DatePicker value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maintenance_charges_rupees"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Maintenance Charges (Rs)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="0" step="1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maintenance_paid_by"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Maintenance Paid By</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={MAINTENANCE_PAID_BY.TENANT}>Tenant</SelectItem>
                    <SelectItem value={MAINTENANCE_PAID_BY.OWNER}>Owner</SelectItem>
                    <SelectItem value={MAINTENANCE_PAID_BY.SPLIT}>Split</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="rent_escalation_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rent Escalation Type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={RENT_ESCALATION_TYPE.PERCENTAGE}>Percentage</SelectItem>
                    <SelectItem value={RENT_ESCALATION_TYPE.FIXED_AMOUNT}>Fixed Amount</SelectItem>
                    <SelectItem value={RENT_ESCALATION_TYPE.NONE}>None</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="rent_escalation_value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Rent Escalation Value
                  {escalationType === RENT_ESCALATION_TYPE.PERCENTAGE ? " (%)" : " (Rs)"}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min="0"
                    step={escalationType === RENT_ESCALATION_TYPE.PERCENTAGE ? "0.1" : "1"}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="brokerage_tenant_side_rupees"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Brokerage Tenant Side (Rs)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="0" step="1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="brokerage_owner_side_rupees"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Brokerage Owner Side (Rs)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="0" step="1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="token_advance_amount_rupees"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Token Advance (Rs)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="0" step="1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="furnishing_terms"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Furnishing Terms</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  placeholder="Describe furniture and appliance terms"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="special_conditions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Special Conditions (optional)</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  rows={3}
                  placeholder="Any additional agreement clauses"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-wrap justify-end gap-2">
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : isEditMode ? (
              "Update Proposal"
            ) : (
              "Create Proposal"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export type { ProposalEditorProps, ProposalFormValues };
