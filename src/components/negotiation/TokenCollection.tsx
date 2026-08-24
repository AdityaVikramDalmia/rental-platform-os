"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { CheckCircle2, Loader2, ReceiptText } from "lucide-react";
import { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  TOKEN_COLLECTION_METHOD,
  TOKEN_RECORD_STATUS,
  TOKEN_RECORD_STATUS_COLORS,
  TOKEN_RECORD_STATUS_LABELS,
  TOKEN_REFUND_POLICY,
  type TokenCollectionMethod,
  type TokenRecordStatus,
  type TokenRefundPolicy,
} from "../../../lib/constants";
import { formatDateTime } from "../../../lib/dates";
import { formatINR } from "../../../lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

const collectionMethodOptions: Array<{ value: TokenCollectionMethod; label: string }> = [
  { value: TOKEN_COLLECTION_METHOD.CASH, label: "Cash" },
  { value: TOKEN_COLLECTION_METHOD.UPI, label: "UPI" },
  { value: TOKEN_COLLECTION_METHOD.BANK_TRANSFER, label: "Bank Transfer" },
  { value: TOKEN_COLLECTION_METHOD.CHEQUE, label: "Cheque" },
];

const collectionMethodLabelMap = Object.fromEntries(
  collectionMethodOptions.map((option) => [option.value, option.label]),
) as Record<TokenCollectionMethod, string>;

const refundPolicyOptions: Array<{ value: TokenRefundPolicy; label: string }> = [
  { value: TOKEN_REFUND_POLICY.NON_REFUNDABLE, label: "Non-refundable" },
  {
    value: TOKEN_REFUND_POLICY.REFUNDABLE_WITHIN_DAYS,
    label: "Refundable within fixed days",
  },
  { value: TOKEN_REFUND_POLICY.PARTIAL_REFUND, label: "Partial refund" },
  { value: TOKEN_REFUND_POLICY.CASE_BY_CASE, label: "Case-by-case" },
];

const refundPolicyLabelMap = Object.fromEntries(
  refundPolicyOptions.map((option) => [option.value, option.label]),
) as Record<TokenRefundPolicy, string>;

type TokenCollectionFormValues = {
  collection_method: TokenCollectionMethod;
  refund_policy: TokenRefundPolicy;
  refund_days?: string;
  refund_percentage?: string;
  receipt_notes?: string;
};

const tokenCollectionSchema = z
  .object({
    collection_method: z.enum([
      TOKEN_COLLECTION_METHOD.CASH,
      TOKEN_COLLECTION_METHOD.UPI,
      TOKEN_COLLECTION_METHOD.BANK_TRANSFER,
      TOKEN_COLLECTION_METHOD.CHEQUE,
    ]),
    refund_policy: z.enum([
      TOKEN_REFUND_POLICY.NON_REFUNDABLE,
      TOKEN_REFUND_POLICY.REFUNDABLE_WITHIN_DAYS,
      TOKEN_REFUND_POLICY.PARTIAL_REFUND,
      TOKEN_REFUND_POLICY.CASE_BY_CASE,
    ]),
    refund_days: z.string().optional(),
    refund_percentage: z.string().optional(),
    receipt_notes: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const refundDays = values.refund_days?.trim();
    const refundPercentage = values.refund_percentage?.trim();

    if (values.refund_policy === TOKEN_REFUND_POLICY.REFUNDABLE_WITHIN_DAYS) {
      const parsedRefundDays = Number(refundDays);
      if (!refundDays || !Number.isInteger(parsedRefundDays) || parsedRefundDays <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["refund_days"],
          message: "Enter a valid number of days",
        });
      }
    }

    if (values.refund_policy === TOKEN_REFUND_POLICY.PARTIAL_REFUND) {
      const parsedRefundPercentage = Number(refundPercentage);
      if (
        !refundPercentage ||
        !Number.isFinite(parsedRefundPercentage) ||
        parsedRefundPercentage < 0 ||
        parsedRefundPercentage > 100
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["refund_percentage"],
          message: "Enter a valid percentage between 0 and 100",
        });
      }
    }
  });

interface TokenRecordData {
  _id: Id<"negotiation_token_records">;
  amount_paise: number;
  collected_at: number;
  collection_method: TokenCollectionMethod;
  refund_policy: TokenRefundPolicy;
  refund_days?: number;
  refund_percentage?: number;
  tenant_agreed_at: number;
  status: TokenRecordStatus;
  collected_by_admin_id: Id<"users">;
  notes?: string;
}

interface TokenCollectionProps {
  negotiationId: Id<"negotiations">;
  tokenRecord: TokenRecordData | null;
  proposalAmount?: number;
  onSuccess?: () => void;
  canManage?: boolean;
}

function formatRefundPolicy(
  record: Pick<TokenRecordData, "refund_policy" | "refund_days" | "refund_percentage">,
) {
  const baseLabel = refundPolicyLabelMap[record.refund_policy] ?? record.refund_policy;
  if (record.refund_policy === TOKEN_REFUND_POLICY.REFUNDABLE_WITHIN_DAYS && record.refund_days) {
    return `${baseLabel} (${record.refund_days} days)`;
  }

  if (
    record.refund_policy === TOKEN_REFUND_POLICY.PARTIAL_REFUND &&
    record.refund_percentage !== undefined
  ) {
    return `${baseLabel} (${record.refund_percentage}% eligible)`;
  }

  return baseLabel;
}

export function TokenCollection({
  negotiationId,
  tokenRecord,
  proposalAmount,
  onSuccess,
  canManage = true,
}: TokenCollectionProps) {
  const recordCollection = useMutation(api.negotiationTokens.recordCollection);

  const form = useForm<TokenCollectionFormValues>({
    resolver: zodResolver(tokenCollectionSchema) as Resolver<TokenCollectionFormValues>,
    defaultValues: {
      collection_method: tokenRecord?.collection_method ?? TOKEN_COLLECTION_METHOD.CASH,
      refund_policy: tokenRecord?.refund_policy ?? TOKEN_REFUND_POLICY.CASE_BY_CASE,
      refund_days: tokenRecord?.refund_days !== undefined ? String(tokenRecord.refund_days) : "",
      refund_percentage:
        tokenRecord?.refund_percentage !== undefined ? String(tokenRecord.refund_percentage) : "",
      receipt_notes: tokenRecord?.notes ?? "",
    },
  });

  const selectedRefundPolicy = form.watch("refund_policy");
  const isSubmitting = form.formState.isSubmitting;
  const isReadOnly = !canManage;

  useEffect(() => {
    form.reset({
      collection_method: tokenRecord?.collection_method ?? TOKEN_COLLECTION_METHOD.CASH,
      refund_policy: tokenRecord?.refund_policy ?? TOKEN_REFUND_POLICY.CASE_BY_CASE,
      refund_days: tokenRecord?.refund_days !== undefined ? String(tokenRecord.refund_days) : "",
      refund_percentage:
        tokenRecord?.refund_percentage !== undefined ? String(tokenRecord.refund_percentage) : "",
      receipt_notes: tokenRecord?.notes ?? "",
    });
  }, [form, tokenRecord]);

  async function onSubmit(values: TokenCollectionFormValues) {
    if (!canManage) {
      toast.error("You do not have permission to record token collection");
      return;
    }

    if (!tokenRecord) {
      return;
    }

    try {
      await recordCollection({
        negotiation_id: negotiationId,
        collection_method: values.collection_method,
        refund_policy: values.refund_policy,
        refund_days:
          values.refund_policy === TOKEN_REFUND_POLICY.REFUNDABLE_WITHIN_DAYS
            ? Number(values.refund_days)
            : undefined,
        refund_percentage:
          values.refund_policy === TOKEN_REFUND_POLICY.PARTIAL_REFUND
            ? Number(values.refund_percentage)
            : undefined,
        receipt_notes: values.receipt_notes?.trim() || undefined,
      });

      toast.success("Token collection recorded");
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record token collection");
    }
  }

  if (!tokenRecord) {
    return (
      <Card className="border-dashed border-slate-300 bg-slate-50 py-0">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm text-slate-900">Token Collection</CardTitle>
          <CardDescription>
            Waiting for tenant to agree to token policy before collection can be recorded.
          </CardDescription>
        </CardHeader>
        {proposalAmount !== undefined ? (
          <CardContent className="px-4 pb-4 text-sm text-slate-700">
            Proposed token amount:{" "}
            <span className="font-semibold">{formatINR(proposalAmount)}</span>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  if (tokenRecord.status !== TOKEN_RECORD_STATUS.PENDING) {
    return (
      <Card className="border-slate-200 py-0">
        <CardHeader className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-900">
              <CheckCircle2 className="size-4 text-emerald-600" />
              Token Record
            </CardTitle>
            <Badge
              variant="secondary"
              className={cn(
                "text-[11px] font-semibold",
                TOKEN_RECORD_STATUS_COLORS[tokenRecord.status],
              )}
            >
              {TOKEN_RECORD_STATUS_LABELS[tokenRecord.status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5 px-4 pb-4 text-sm text-slate-700">
          <p>
            Amount:{" "}
            <span className="font-semibold text-slate-900">
              {formatINR(tokenRecord.amount_paise)}
            </span>
          </p>
          <p>
            Collection Method:{" "}
            <span className="font-medium text-slate-900">
              {collectionMethodLabelMap[tokenRecord.collection_method]}
            </span>
          </p>
          <p>
            Refund Policy:{" "}
            <span className="font-medium text-slate-900">{formatRefundPolicy(tokenRecord)}</span>
          </p>
          <p>
            Collected On:{" "}
            <span className="font-medium text-slate-900">
              {formatDateTime(tokenRecord.collected_at)}
            </span>
          </p>
          {tokenRecord.notes ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
              {tokenRecord.notes}
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 py-0">
      <CardHeader className="px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm text-slate-900">
          <ReceiptText className="size-4 text-indigo-600" />
          Record Token Collection
        </CardTitle>
        <CardDescription>
          Tenant has agreed to policy. Capture collection method and final refund terms.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 px-4 pb-4">
        {isReadOnly ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            View-only access. Token collection can be recorded by users with manage permission.
          </p>
        ) : null}

        <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-2">
          <p>
            Amount:{" "}
            <span className="font-semibold text-slate-900">
              {formatINR(tokenRecord.amount_paise)}
            </span>
          </p>
          <p>
            Tenant Agreed:{" "}
            <span className="font-medium text-slate-900">
              {formatDateTime(tokenRecord.tenant_agreed_at)}
            </span>
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
            <FormField
              control={form.control}
              name="collection_method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Collection Method</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isReadOnly || isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select collection method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {collectionMethodOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="refund_policy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Refund Policy</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isReadOnly || isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select refund policy" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {refundPolicyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedRefundPolicy === TOKEN_REFUND_POLICY.REFUNDABLE_WITHIN_DAYS ? (
              <FormField
                control={form.control}
                name="refund_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Refund Window (days)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min="1"
                        step="1"
                        placeholder="e.g. 7"
                        disabled={isReadOnly || isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {selectedRefundPolicy === TOKEN_REFUND_POLICY.PARTIAL_REFUND ? (
              <FormField
                control={form.control}
                name="refund_percentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Refund Percentage</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        placeholder="e.g. 50"
                        disabled={isReadOnly || isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="receipt_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Receipt Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={3}
                      placeholder="Reference number, location, witness, or any remarks"
                      disabled={isReadOnly || isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isSubmitting || isReadOnly}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Recording...
                </>
              ) : (
                "Record Collection"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export type { TokenCollectionProps, TokenRecordData };
