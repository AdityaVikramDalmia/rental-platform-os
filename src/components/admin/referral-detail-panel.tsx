"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  PAYOUT_METHOD,
  REFERRAL_MILESTONE_STATUS,
  REFERRAL_MILESTONE_STATUS_COLORS,
  REFERRAL_MILESTONE_STATUS_LABELS,
  REFERRAL_STATUS,
  REFERRAL_STATUS_COLORS,
  REFERRAL_STATUS_LABELS,
  REFERRAL_TYPE,
  REFERRAL_TYPE_LABELS,
  USER_TYPE,
  type PayoutMethod,
  type ReferralMilestoneStatus,
} from "../../../lib/constants";
import { formatDateTime } from "../../../lib/dates";
import { formatINR } from "../../../lib/money";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Reason must be at least 3 characters"),
});

const overrideSchema = z.object({
  referral_code: z
    .string()
    .trim()
    .min(3, "Referral code is required")
    .transform((value) => value.toUpperCase()),
  target_user_type: z.enum([USER_TYPE.TENANT, USER_TYPE.OWNER]).optional(),
  reason: z.string().trim().min(3, "Reason must be at least 3 characters"),
});

const markPaidSchema = z.object({
  payout_method: z.enum([PAYOUT_METHOD.CASH, PAYOUT_METHOD.UPI, PAYOUT_METHOD.BANK_TRANSFER]),
});

type ReasonValues = z.infer<typeof reasonSchema>;
type OverrideValues = z.infer<typeof overrideSchema>;
type MarkPaidValues = z.infer<typeof markPaidSchema>;

type ReferralDetailPanelProps = {
  referralId: Id<"referrals"> | null;
  closeAction: () => void;
  hasReferralsManage: boolean;
  hasReferralsApprovePayout: boolean;
};

function getUpdatedAt(
  createdAt: number,
  milestones: Array<{ triggered_at?: number; paid_at?: number }>,
): number {
  let latest = createdAt;

  for (const milestone of milestones) {
    if (milestone.triggered_at && milestone.triggered_at > latest) {
      latest = milestone.triggered_at;
    }

    if (milestone.paid_at && milestone.paid_at > latest) {
      latest = milestone.paid_at;
    }
  }

  return latest;
}

export function ReferralDetailPanel({
  referralId,
  closeAction,
  hasReferralsManage,
  hasReferralsApprovePayout,
}: ReferralDetailPanelProps) {
  const detail = useQuery(api.referrals.getById, referralId ? { id: referralId } : "skip");
  const approveMilestone = useMutation(api.referralMilestones.approve);
  const markMilestonePaid = useMutation(api.referralMilestones.markPaid);
  const voidMilestone = useMutation(api.referralMilestones["void"]);
  const voidReferral = useMutation(api.referrals.voidReferral);
  const overrideAttribution = useMutation(api.referrals.overrideAttribution);

  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [voidReferralOpen, setVoidReferralOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [markPaidMilestoneId, setMarkPaidMilestoneId] = useState<Id<"referral_milestones"> | null>(
    null,
  );
  const [voidMilestoneId, setVoidMilestoneId] = useState<Id<"referral_milestones"> | null>(null);

  const voidReferralForm = useForm<ReasonValues>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: "" },
  });

  const overrideForm = useForm<OverrideValues>({
    resolver: zodResolver(overrideSchema),
    defaultValues: { referral_code: "", target_user_type: undefined, reason: "" },
  });

  const markPaidForm = useForm<MarkPaidValues>({
    resolver: zodResolver(markPaidSchema),
    defaultValues: { payout_method: PAYOUT_METHOD.UPI },
  });

  const voidMilestoneForm = useForm<ReasonValues>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: "" },
  });

  useEffect(() => {
    if (!referralId) {
      setVoidReferralOpen(false);
      setOverrideOpen(false);
      setMarkPaidMilestoneId(null);
      setVoidMilestoneId(null);
      voidReferralForm.reset({ reason: "" });
      overrideForm.reset({ referral_code: "", target_user_type: undefined, reason: "" });
      markPaidForm.reset({ payout_method: PAYOUT_METHOD.UPI });
      voidMilestoneForm.reset({ reason: "" });
    }
  }, [markPaidForm, overrideForm, referralId, voidMilestoneForm, voidReferralForm]);

  useEffect(() => {
    if (!detail) {
      return;
    }

    if (!detail.referral.closure_id) {
      overrideForm.setValue("target_user_type", undefined);
      return;
    }

    const inferredTargetUserType =
      detail.referral.referral_type === REFERRAL_TYPE.TENANT_FINDING
        ? USER_TYPE.TENANT
        : detail.referral.referral_type === REFERRAL_TYPE.OWNER_FINDING
          ? USER_TYPE.OWNER
          : undefined;

    if (inferredTargetUserType) {
      overrideForm.setValue("target_user_type", inferredTargetUserType);
    }
  }, [detail, overrideForm]);

  useEffect(() => {
    if (detail && detail.referral.referral_type === REFERRAL_TYPE.GUARD) {
      setOverrideOpen(false);
    }
  }, [detail]);

  const updatedAt = useMemo(() => {
    if (!detail) {
      return null;
    }

    return getUpdatedAt(detail.referral._creationTime, detail.milestones);
  }, [detail]);

  const isOpen = referralId !== null;
  const isLoading = isOpen && detail === undefined;
  const isNotFound = isOpen && detail === null;

  const canApproveAndPay = hasReferralsApprovePayout;
  const canManage = hasReferralsManage;
  const canVoidReferral = detail
    ? detail.referral.status !== REFERRAL_STATUS.VOIDED && canManage
    : false;
  const canOverrideAttribution =
    detail && detail.referral.referral_type !== REFERRAL_TYPE.GUARD && canManage ? true : false;

  async function handleApproveMilestone(id: Id<"referral_milestones">) {
    if (!canApproveAndPay) {
      toast.error("You do not have permission to approve milestone payouts");
      return;
    }

    const loadingKey = `approve:${id}`;
    setActionLoadingKey(loadingKey);

    try {
      await approveMilestone({ id });
      toast.success("Milestone approved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve milestone");
    } finally {
      setActionLoadingKey(null);
    }
  }

  async function onSubmitMarkPaid(values: MarkPaidValues) {
    if (!canApproveAndPay) {
      toast.error("You do not have permission to mark milestone payouts");
      return;
    }

    if (!markPaidMilestoneId) {
      return;
    }

    const loadingKey = `paid:${markPaidMilestoneId}`;
    setActionLoadingKey(loadingKey);

    try {
      await markMilestonePaid({
        id: markPaidMilestoneId,
        payout_method: values.payout_method as PayoutMethod,
      });
      toast.success("Milestone marked as paid");
      setMarkPaidMilestoneId(null);
      markPaidForm.reset({ payout_method: PAYOUT_METHOD.UPI });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark milestone as paid");
    } finally {
      setActionLoadingKey(null);
    }
  }

  async function onSubmitVoidMilestone(values: ReasonValues) {
    if (!canManage) {
      toast.error("You do not have permission to void milestones");
      return;
    }

    if (!voidMilestoneId) {
      return;
    }

    const loadingKey = `void-milestone:${voidMilestoneId}`;
    setActionLoadingKey(loadingKey);

    try {
      await voidMilestone({
        id: voidMilestoneId,
        reason: values.reason.trim(),
      });
      toast.success("Milestone voided");
      setVoidMilestoneId(null);
      voidMilestoneForm.reset({ reason: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to void milestone");
    } finally {
      setActionLoadingKey(null);
    }
  }

  async function onSubmitVoidReferral(values: ReasonValues) {
    if (!canManage) {
      toast.error("You do not have permission to void referrals");
      return;
    }

    if (!detail) {
      return;
    }

    const loadingKey = `void-referral:${detail.referral._id}`;
    setActionLoadingKey(loadingKey);

    try {
      await voidReferral({
        id: detail.referral._id,
        reason: values.reason.trim(),
      });
      toast.success("Referral voided");
      setVoidReferralOpen(false);
      voidReferralForm.reset({ reason: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to void referral");
    } finally {
      setActionLoadingKey(null);
    }
  }

  async function onSubmitOverride(values: OverrideValues) {
    if (!canManage) {
      toast.error("You do not have permission to override referral attribution");
      return;
    }

    if (!detail) {
      return;
    }

    if (detail.referral.referral_type === REFERRAL_TYPE.GUARD) {
      toast.error("Override not supported for guard referrals");
      return;
    }

    const loadingKey = `override:${detail.referral._id}`;
    setActionLoadingKey(loadingKey);

    try {
      const targetArgs = (() => {
        if (!detail.referral.closure_id) {
          return { referred_user_id: detail.referral.referred_user_id };
        }

        const targetUserType = values.target_user_type;

        if (!targetUserType) {
          throw new Error("Select whether the override targets tenant or owner attribution");
        }

        return {
          closure_id: detail.referral.closure_id,
          target_user_type: targetUserType,
        };
      })();

      await overrideAttribution({
        ...targetArgs,
        new_referral_code: values.referral_code,
        reason: values.reason.trim(),
      });

      toast.success("Referral attribution overridden");
      setOverrideOpen(false);
      overrideForm.reset({ referral_code: "", target_user_type: undefined, reason: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to override attribution");
    } finally {
      setActionLoadingKey(null);
    }
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && closeAction()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:w-[42vw] sm:max-w-none">
          <SheetHeader>
            {isLoading ? (
              <>
                <SheetTitle className="sr-only">Loading referral details</SheetTitle>
                <SheetDescription className="sr-only">Please wait</SheetDescription>
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-4 w-40" />
              </>
            ) : detail ? (
              <>
                <div className="flex items-center gap-2">
                  <SheetTitle>Referral {detail.referral._id.slice(-8)}</SheetTitle>
                  <Badge className={REFERRAL_STATUS_COLORS[detail.referral.status]}>
                    {REFERRAL_STATUS_LABELS[detail.referral.status]}
                  </Badge>
                </div>
                <SheetDescription>
                  {REFERRAL_TYPE_LABELS[detail.referral.referral_type]} referral
                </SheetDescription>
              </>
            ) : isNotFound ? (
              <>
                <SheetTitle>Referral not found</SheetTitle>
                <SheetDescription>
                  This referral no longer exists or you no longer have access to it.
                </SheetDescription>
              </>
            ) : (
              <>
                <SheetTitle>Referral Details</SheetTitle>
                <SheetDescription>Select a referral to view details.</SheetDescription>
              </>
            )}
          </SheetHeader>

          {isLoading ? (
            <div className="space-y-4 px-4 py-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : null}

          {isNotFound ? (
            <div className="px-4 py-4 text-sm text-slate-600">Referral not found.</div>
          ) : null}

          {detail ? (
            <div className="space-y-5 px-4 pb-6">
              <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <p className="text-slate-600">
                    Type:{" "}
                    <span className="font-medium text-slate-900">
                      {REFERRAL_TYPE_LABELS[detail.referral.referral_type]}
                    </span>
                  </p>
                  <p className="text-slate-600">
                    Status:{" "}
                    <span className="font-medium text-slate-900">
                      {REFERRAL_STATUS_LABELS[detail.referral.status]}
                    </span>
                  </p>
                  <p className="text-slate-600">
                    Created:{" "}
                    <span className="font-medium text-slate-900">
                      {formatDateTime(detail.referral._creationTime)}
                    </span>
                  </p>
                  <p className="text-slate-600">
                    Updated:{" "}
                    <span className="font-medium text-slate-900">
                      {updatedAt ? formatDateTime(updatedAt) : "-"}
                    </span>
                  </p>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Users
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-3 text-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Referrer</p>
                    <p className="font-medium text-slate-900">
                      {detail.referrer?.name ?? "Unknown"}
                    </p>
                    <p className="text-slate-600">{detail.referrer?.phone ?? "No phone"}</p>
                    <p className="text-slate-600">{detail.referrer?.email ?? "No email"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 text-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Referred User</p>
                    <p className="font-medium text-slate-900">
                      {detail.referred?.name ?? "Unknown"}
                    </p>
                    <p className="text-slate-600">{detail.referred?.phone ?? "No phone"}</p>
                    <p className="text-slate-600">{detail.referred?.email ?? "No email"}</p>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Linked Entities
                </h3>
                <div className="grid gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="text-slate-600">
                    Lead:{" "}
                    {detail.referral.lead_id ? (
                      <Link
                        href={`/admin/leads?id=${detail.referral.lead_id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {detail.referral.lead_id}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </p>
                  <p className="text-slate-600">
                    Listing:{" "}
                    {detail.referral.listing_id ? (
                      <Link
                        href={`/admin/listings/${detail.referral.listing_id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {detail.referral.listing_id}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </p>
                  <p className="text-slate-600">
                    Closure:{" "}
                    {detail.referral.closure_id ? (
                      <Link
                        href={`/admin/closures/${detail.referral.closure_id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {detail.referral.closure_id}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </p>
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Milestones
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total bonus:{" "}
                    <span className="font-semibold text-slate-900">
                      {formatINR(detail.milestone_summary.total_amount)}
                    </span>
                  </p>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Amount</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Triggered</th>
                        <th className="px-3 py-2 font-medium">Paid</th>
                        <th className="px-3 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.milestones.map((milestone) => {
                        const showApprove =
                          canApproveAndPay &&
                          milestone.status === REFERRAL_MILESTONE_STATUS.TRIGGERED;
                        const showMarkPaid =
                          canApproveAndPay &&
                          milestone.status === REFERRAL_MILESTONE_STATUS.APPROVED;
                        const showVoid =
                          canManage &&
                          (milestone.status === REFERRAL_MILESTONE_STATUS.PENDING ||
                            milestone.status === REFERRAL_MILESTONE_STATUS.TRIGGERED ||
                            milestone.status === REFERRAL_MILESTONE_STATUS.APPROVED);

                        return (
                          <tr
                            key={milestone._id}
                            className="border-b border-slate-100 text-slate-700"
                          >
                            <td className="px-3 py-2">{milestone.milestone_type}</td>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {formatINR(milestone.amount)}
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                className={cn(
                                  REFERRAL_MILESTONE_STATUS_COLORS[
                                    milestone.status as ReferralMilestoneStatus
                                  ],
                                )}
                              >
                                {
                                  REFERRAL_MILESTONE_STATUS_LABELS[
                                    milestone.status as ReferralMilestoneStatus
                                  ]
                                }
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              {milestone.triggered_at
                                ? formatDateTime(milestone.triggered_at)
                                : "-"}
                            </td>
                            <td className="px-3 py-2">
                              {milestone.paid_at ? formatDateTime(milestone.paid_at) : "-"}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap justify-end gap-1">
                                {showApprove ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleApproveMilestone(milestone._id)}
                                    disabled={actionLoadingKey === `approve:${milestone._id}`}
                                  >
                                    {actionLoadingKey === `approve:${milestone._id}` ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                      "Approve"
                                    )}
                                  </Button>
                                ) : null}

                                {showMarkPaid ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setMarkPaidMilestoneId(milestone._id)}
                                  >
                                    Mark Paid
                                  </Button>
                                ) : null}

                                {showVoid ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => setVoidMilestoneId(milestone._id)}
                                  >
                                    Void
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Referral Actions
                </h3>
                <div className="flex flex-wrap gap-2">
                  {canManage ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setVoidReferralOpen(true)}
                      disabled={!canVoidReferral}
                    >
                      Void Referral
                    </Button>
                  ) : null}
                  {canOverrideAttribution ? (
                    <Button type="button" variant="outline" onClick={() => setOverrideOpen(true)}>
                      Override Attribution
                    </Button>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={voidReferralOpen} onOpenChange={setVoidReferralOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Referral</DialogTitle>
            <DialogDescription>
              Provide a reason. This will also void all unpaid milestones.
            </DialogDescription>
          </DialogHeader>

          <Form {...voidReferralForm}>
            <form
              onSubmit={voidReferralForm.handleSubmit(onSubmitVoidReferral)}
              className="space-y-4"
            >
              <FormField
                control={voidReferralForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter void reason" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setVoidReferralOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={
                    detail ? actionLoadingKey === `void-referral:${detail.referral._id}` : false
                  }
                >
                  {detail && actionLoadingKey === `void-referral:${detail.referral._id}` ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Voiding...
                    </>
                  ) : (
                    "Confirm Void"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override Attribution</DialogTitle>
            <DialogDescription>
              Replace current attribution with a new referral code.
            </DialogDescription>
          </DialogHeader>

          <Form {...overrideForm}>
            <form onSubmit={overrideForm.handleSubmit(onSubmitOverride)} className="space-y-4">
              <FormField
                control={overrideForm.control}
                name="referral_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referral Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="FLAT-ABCDE"
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={overrideForm.control}
                name="target_user_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attribution Target</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) =>
                        field.onChange(value as OverrideValues["target_user_type"])
                      }
                      disabled={!detail?.referral.closure_id}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select target user" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={USER_TYPE.TENANT}>Tenant</SelectItem>
                        <SelectItem value={USER_TYPE.OWNER}>Owner</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={overrideForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Input placeholder="Why are you overriding attribution?" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOverrideOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={detail ? actionLoadingKey === `override:${detail.referral._id}` : false}
                >
                  {detail && actionLoadingKey === `override:${detail.referral._id}` ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Overriding...
                    </>
                  ) : (
                    "Confirm Override"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={markPaidMilestoneId !== null}
        onOpenChange={(open) => !open && setMarkPaidMilestoneId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Milestone Paid</DialogTitle>
            <DialogDescription>Select payout method for this payout.</DialogDescription>
          </DialogHeader>

          <Form {...markPaidForm}>
            <form onSubmit={markPaidForm.handleSubmit(onSubmitMarkPaid)} className="space-y-4">
              <FormField
                control={markPaidForm.control}
                name="payout_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payout Method</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select payout method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={PAYOUT_METHOD.CASH}>Cash</SelectItem>
                        <SelectItem value={PAYOUT_METHOD.UPI}>UPI</SelectItem>
                        <SelectItem value={PAYOUT_METHOD.BANK_TRANSFER}>Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMarkPaidMilestoneId(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    markPaidMilestoneId ? actionLoadingKey === `paid:${markPaidMilestoneId}` : false
                  }
                >
                  {markPaidMilestoneId && actionLoadingKey === `paid:${markPaidMilestoneId}` ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Mark Paid"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={voidMilestoneId !== null}
        onOpenChange={(open) => !open && setVoidMilestoneId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Milestone</DialogTitle>
            <DialogDescription>Provide a reason for voiding this milestone.</DialogDescription>
          </DialogHeader>

          <Form {...voidMilestoneForm}>
            <form
              onSubmit={voidMilestoneForm.handleSubmit(onSubmitVoidMilestone)}
              className="space-y-4"
            >
              <FormField
                control={voidMilestoneForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter reason" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setVoidMilestoneId(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={
                    voidMilestoneId
                      ? actionLoadingKey === `void-milestone:${voidMilestoneId}`
                      : false
                  }
                >
                  {voidMilestoneId && actionLoadingKey === `void-milestone:${voidMilestoneId}` ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Voiding...
                    </>
                  ) : (
                    "Void Milestone"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
