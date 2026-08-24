"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Check, ChevronDown, ChevronUp, MessageSquare, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { Doc } from "../../../convex/_generated/dataModel";
import {
  DEAL_CHECKLIST_ITEM_APPROVAL,
  DEAL_CHECKLIST_ITEM_OVERALL_STATUS,
  DEAL_CHECKLIST_STATUS,
  type DealChecklistItemApproval,
  type DealChecklistItemOverallStatus,
  type DealChecklistStatus,
  type DealTermType,
} from "../../../lib/constants";
import { formatRelativeTime } from "../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DealChecklist = Doc<"deal_checklists">;
type ChecklistItem = DealChecklist["items"][number];
type ApprovalInfo = ChecklistItem["tenant_approval"];

export type EnrichedChecklistItem = ChecklistItem & {
  my_approval?: ApprovalInfo;
};

type ChecklistItemCardProps = {
  item: EnrichedChecklistItem;
  currentUserRole: "TENANT" | "OWNER" | "ADMIN";
  checklistStatus: DealChecklistStatus;
  action: (
    itemId: string,
    response: "AGREED" | "DISAGREED" | "COMMENTED",
    comment?: string,
  ) => Promise<void>;
  className?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERM_TYPE_LABELS: Record<DealTermType, string> = {
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

const TERM_TYPE_ICONS: Partial<Record<DealTermType, string>> = {
  RENT_AMOUNT: "₹",
  DEPOSIT: "🔒",
  LEASE_DURATION: "📅",
  MOVE_IN_DATE: "🏠",
  MAINTENANCE: "🔧",
  BROKERAGE: "💼",
};

const APPROVAL_COLORS: Record<DealChecklistItemApproval, string> = {
  [DEAL_CHECKLIST_ITEM_APPROVAL.PENDING]: "bg-slate-100 text-slate-500 border-slate-200",
  [DEAL_CHECKLIST_ITEM_APPROVAL.AGREED]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [DEAL_CHECKLIST_ITEM_APPROVAL.DISAGREED]: "bg-rose-50 text-rose-700 border-rose-200",
  [DEAL_CHECKLIST_ITEM_APPROVAL.COMMENTED]: "bg-sky-50 text-sky-700 border-sky-200",
};

const APPROVAL_LABELS: Record<DealChecklistItemApproval, string> = {
  [DEAL_CHECKLIST_ITEM_APPROVAL.PENDING]: "Pending",
  [DEAL_CHECKLIST_ITEM_APPROVAL.AGREED]: "Agreed",
  [DEAL_CHECKLIST_ITEM_APPROVAL.DISAGREED]: "Disagreed",
  [DEAL_CHECKLIST_ITEM_APPROVAL.COMMENTED]: "Commented",
};

const OVERALL_STATUS_COLORS: Record<DealChecklistItemOverallStatus, string> = {
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.UNREVIEWED]: "bg-slate-100 text-slate-600",
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.RESOLVED]: "bg-emerald-100 text-emerald-700",
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.DISPUTED]: "bg-rose-100 text-rose-700",
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.NEEDS_DISCUSSION]: "bg-amber-100 text-amber-700",
};

const OVERALL_STATUS_LABELS: Record<DealChecklistItemOverallStatus, string> = {
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.UNREVIEWED]: "Unreviewed",
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.RESOLVED]: "Resolved",
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.DISPUTED]: "Disputed",
  [DEAL_CHECKLIST_ITEM_OVERALL_STATUS.NEEDS_DISCUSSION]: "Needs Discussion",
};

// ---------------------------------------------------------------------------
// Form Schema
// ---------------------------------------------------------------------------

const responseSchema = z.object({
  response: z.enum(["AGREED", "DISAGREED", "COMMENTED"]),
  comment: z.string().optional(),
});

type ResponseFormData = z.infer<typeof responseSchema>;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ApprovalBadge({ label, approval }: { label: string; approval: ApprovalInfo }) {
  const status = approval.status as DealChecklistItemApproval;
  const colorClass = APPROVAL_COLORS[status] ?? APPROVAL_COLORS.PENDING;
  const statusLabel = APPROVAL_LABELS[status] ?? status;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <Badge variant="outline" className={cn("text-[11px] font-semibold", colorClass)}>
        {status === "AGREED" && <Check className="mr-1 size-3" />}
        {status === "DISAGREED" && <X className="mr-1 size-3" />}
        {status === "COMMENTED" && <MessageSquare className="mr-1 size-3" />}
        {statusLabel}
      </Badge>
      {approval.comment && (
        <p className="mt-0.5 text-[11px] leading-tight text-slate-500 italic">
          &ldquo;{approval.comment}&rdquo;
        </p>
      )}
      {approval.responded_at && (
        <span className="text-[10px] text-slate-400">
          {formatRelativeTime(approval.responded_at)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ChecklistItemCard({
  item,
  currentUserRole,
  checklistStatus,
  action,
  className,
}: ChecklistItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ResponseFormData>({
    resolver: zodResolver(responseSchema),
    defaultValues: {
      response: "AGREED",
      comment: "",
    },
  });

  const myApprovalStatus = item.my_approval?.status ?? "PENDING";
  const hasAlreadyResponded = myApprovalStatus !== "PENDING";
  const canRespond =
    (checklistStatus === DEAL_CHECKLIST_STATUS.SHARED ||
      checklistStatus === DEAL_CHECKLIST_STATUS.IN_REVIEW) &&
    !hasAlreadyResponded &&
    currentUserRole !== "ADMIN";

  const displayValue = item.admin_edited_value ?? item.extracted_value;
  const termIcon = TERM_TYPE_ICONS[item.term_type as DealTermType];
  const termLabel = TERM_TYPE_LABELS[item.term_type as DealTermType] ?? item.term_type;
  const overallStatus = item.overall_status as DealChecklistItemOverallStatus;

  async function handleSubmit(data: ResponseFormData) {
    setIsSubmitting(true);
    try {
      await action(item.item_id, data.response, data.comment?.trim() || undefined);
      setIsExpanded(false);
      form.reset();
    } catch (error) {
      void error;
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card
      className={cn(
        "overflow-hidden border transition-all duration-200",
        overallStatus === "RESOLVED" && "border-emerald-200 bg-emerald-50/30",
        overallStatus === "DISPUTED" && "border-rose-200 bg-rose-50/30",
        overallStatus === "NEEDS_DISCUSSION" && "border-amber-200 bg-amber-50/30",
        overallStatus === "UNREVIEWED" && "border-slate-200",
        className,
      )}
    >
      <CardHeader className="px-4 py-3 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {termIcon && <span className="text-base leading-none">{termIcon}</span>}
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {termLabel}
            </span>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              "shrink-0 text-[10px] font-semibold",
              OVERALL_STATUS_COLORS[overallStatus],
            )}
          >
            {OVERALL_STATUS_LABELS[overallStatus]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 pt-2">
        {/* Description & Value */}
        <p className="text-sm leading-relaxed text-slate-700">{item.description}</p>
        {displayValue && (
          <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-sm font-semibold text-slate-900">{displayValue}</span>
            {item.admin_edited_value && item.extracted_value && (
              <span className="ml-2 text-[10px] text-slate-400 line-through">
                {item.extracted_value}
              </span>
            )}
          </div>
        )}

        {/* Confidence Indicator */}
        {item.confidence !== undefined && item.confidence < 0.5 && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600">
            <AlertTriangle className="size-3" />
            <span>Low confidence extraction</span>
          </div>
        )}

        <Separator className="my-3" />

        {/* Approval Badges — Both Parties */}
        <div className="grid grid-cols-2 gap-4">
          <ApprovalBadge label="Tenant" approval={item.tenant_approval} />
          <ApprovalBadge label="Owner" approval={item.owner_approval} />
        </div>

        {/* Action Area */}
        {canRespond && (
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full text-xs"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="mr-1 size-3" />
                  Close
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1 size-3" />
                  Respond
                </>
              )}
            </Button>

            {isExpanded && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
                    <FormField
                      control={form.control}
                      name="response"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-slate-600">
                            Your Response
                          </FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              className="flex gap-3"
                            >
                              <div className="flex items-center gap-1.5">
                                <RadioGroupItem value="AGREED" id={`${item.item_id}-agreed`} />
                                <Label
                                  htmlFor={`${item.item_id}-agreed`}
                                  className="flex cursor-pointer items-center gap-1 text-xs font-medium text-emerald-700"
                                >
                                  <Check className="size-3" />
                                  Agree
                                </Label>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <RadioGroupItem
                                  value="DISAGREED"
                                  id={`${item.item_id}-disagreed`}
                                />
                                <Label
                                  htmlFor={`${item.item_id}-disagreed`}
                                  className="flex cursor-pointer items-center gap-1 text-xs font-medium text-rose-700"
                                >
                                  <X className="size-3" />
                                  Disagree
                                </Label>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <RadioGroupItem
                                  value="COMMENTED"
                                  id={`${item.item_id}-commented`}
                                />
                                <Label
                                  htmlFor={`${item.item_id}-commented`}
                                  className="flex cursor-pointer items-center gap-1 text-xs font-medium text-sky-700"
                                >
                                  <MessageSquare className="size-3" />
                                  Comment
                                </Label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="comment"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-slate-600">
                            Comment <span className="font-normal text-slate-400">(optional)</span>
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Add a note about this term..."
                              className="h-16 resize-none text-xs"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsExpanded(false);
                          form.reset();
                        }}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                      <Button type="submit" size="sm" disabled={isSubmitting} className="text-xs">
                        {isSubmitting ? "Submitting..." : "Submit Response"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            )}
          </div>
        )}

        {/* Already Responded Indicator */}
        {hasAlreadyResponded &&
          (checklistStatus === DEAL_CHECKLIST_STATUS.SHARED ||
            checklistStatus === DEAL_CHECKLIST_STATUS.IN_REVIEW) && (
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Check className="size-3" />
              <span>
                You responded: {APPROVAL_LABELS[myApprovalStatus as DealChecklistItemApproval]}
              </span>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
