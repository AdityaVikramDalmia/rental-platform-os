"use client";

import { useMutation, useQuery } from "convex/react";
import { Building2, ClipboardList, FileText, Flag, Home, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Doc } from "../../../../../../convex/_generated/dataModel";
import { PAYOUT_STATUS } from "../../../../../../lib/constants";
import { formatINR, rupeesToPaise } from "../../../../../../lib/money";
import { PayoutStatusBadge } from "@/components/shared/payout-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PayoutAdjustmentBreakdown } from "./payout-adjustment-breakdown";

const IST_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

type PayoutDetailData = {
  payout: Doc<"payouts">;
  closure: Doc<"closures"> | null;
  lead: Doc<"leads"> | null;
  guard: Pick<Doc<"users">, "_id" | "name" | "phone" | "status"> | null;
  building: Doc<"buildings"> | null;
  society: Doc<"societies"> | null;
  approved_by_name: string | null;
  voided_by_name: string | null;
};

type PayoutDetailPanelProps = {
  data: PayoutDetailData;
  canOverrideAmount?: boolean;
};

function formatOptionalDate(ms: number | undefined): string {
  return ms ? IST_DATE_FORMATTER.format(ms) : "—";
}

function formatAdminName(name: string | null): string {
  return name ?? "—";
}

function formatPhone(phone: string | undefined): string {
  return phone ? `+91 ${phone}` : "—";
}

export function PayoutDetailPanel({ data, canOverrideAmount = false }: PayoutDetailPanelProps) {
  const buildingName = data.building?.name ?? "—";
  const flatNumber = data.lead?.flat_number ?? "—";
  const societyName = data.society?.name ?? "—";
  const adjustment = useQuery(api.payouts.getAdjustment, {
    payout_id: data.payout._id,
  });
  const overrideAmount = useMutation(api.payouts.overrideAmount);
  const [isOverrideDialogOpen, setIsOverrideDialogOpen] = useState(false);
  const [overrideAmountRupees, setOverrideAmountRupees] = useState("");
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);

  const payoutIsFinalized =
    data.payout.status === PAYOUT_STATUS.DISBURSED ||
    data.payout.status === PAYOUT_STATUS.FAILED ||
    data.payout.status === PAYOUT_STATUS.VOIDED;
  const canOpenOverride = canOverrideAmount && !payoutIsFinalized;

  useEffect(() => {
    if (!isOverrideDialogOpen) {
      return;
    }

    const seedPaise = adjustment?.final_amount_paise ?? data.payout.amount_paise;
    const seedRupees = seedPaise / 100;
    setOverrideAmountRupees(
      Number.isInteger(seedRupees) ? String(seedRupees) : seedRupees.toFixed(2),
    );
  }, [adjustment?.final_amount_paise, data.payout.amount_paise, isOverrideDialogOpen]);

  const handleOverrideSubmit = async () => {
    const parsedAmount = Number(overrideAmountRupees);

    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast.error("Override amount must be a valid non-negative number");
      return;
    }

    setIsSubmittingOverride(true);

    try {
      await overrideAmount({
        payout_id: data.payout._id,
        override_amount_paise: rupeesToPaise(parsedAmount),
      });

      toast.success("Payout amount override saved");
      setIsOverrideDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save payout override");
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  const renderEntityLink = (id: string | null | undefined, label: string, href: string) => {
    if (!id) {
      return <span>{label}</span>;
    }

    return (
      <Link href={href} className="text-blue-600 hover:underline">
        {label}
      </Link>
    );
  };

  const relatedItems: Array<{
    key: string;
    label: string;
    href: string;
    text: string;
    icon: React.ReactNode;
  }> = [];

  if (data.society?._id) {
    relatedItems.push({
      key: "society",
      label: "Society",
      href: `/admin/societies/${data.society._id}`,
      text: societyName,
      icon: <Building2 className="size-3.5" />,
    });
  }

  if (data.society?._id) {
    relatedItems.push({
      key: "flat",
      label: "Building / Flat",
      href: `/admin/societies/${data.society._id}`,
      text: `${buildingName} / ${flatNumber}`,
      icon: <Home className="size-3.5" />,
    });
  }

  if (data.lead?._id) {
    relatedItems.push({
      key: "lead",
      label: "Lead",
      href: `/admin/leads?id=${data.lead._id}`,
      text: `Lead #${data.lead._id.slice(0, 8)}`,
      icon: <ClipboardList className="size-3.5" />,
    });
  }

  if (data.closure?.listing_id) {
    relatedItems.push({
      key: "listing",
      label: "Listing",
      href: `/admin/listings/${data.closure.listing_id}`,
      text: `Listing #${data.closure.listing_id.slice(0, 8)}`,
      icon: <FileText className="size-3.5" />,
    });
  }

  if (data.closure?._id) {
    relatedItems.push({
      key: "closure",
      label: "Closure",
      href: `/admin/closures/${data.closure._id}`,
      text: `Closure #${data.closure._id.slice(0, 8)}`,
      icon: <Flag className="size-3.5" />,
    });
  }

  relatedItems.push({
    key: "payout",
    label: "Payout",
    href: `/admin/payouts/${data.payout._id}`,
    text: `Payout #${data.payout._id.slice(0, 8)}`,
    icon: <Wallet className="size-3.5" />,
  });

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white">
        <CardHeader className="flex flex-row items-start justify-between pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">Payout Info</CardTitle>
          {canOpenOverride && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsOverrideDialogOpen(true)}
            >
              Override Amount
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Amount</dt>
              <dd className="font-medium text-slate-900">{formatINR(data.payout.amount_paise)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Payment Reference</dt>
              <dd className="font-medium text-slate-900">{data.payout.payment_reference ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd>
                <PayoutStatusBadge status={data.payout.status} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Approved By</dt>
              <dd className="font-medium break-all text-slate-900">
                {formatAdminName(data.approved_by_name)}
              </dd>
            </div>
            {data.payout.failure_reason && (
              <div className="col-span-2">
                <dt className="text-slate-500">Failure Reason</dt>
                <dd className="text-slate-900">{data.payout.failure_reason}</dd>
              </div>
            )}
            {data.payout.voided_reason && (
              <div className="col-span-2">
                <dt className="text-slate-500">Voided Reason</dt>
                <dd className="text-slate-900">{data.payout.voided_reason}</dd>
              </div>
            )}
            {data.payout.voided_by && (
              <div className="col-span-2">
                <dt className="text-slate-500">Voided By</dt>
                <dd className="font-medium break-all text-slate-900">
                  {formatAdminName(data.voided_by_name)}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {adjustment === undefined ? (
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-6 text-sm text-slate-500">
            Loading payout adjustment...
          </CardContent>
        </Card>
      ) : adjustment ? (
        <PayoutAdjustmentBreakdown adjustment={adjustment} />
      ) : (
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-6 text-sm text-slate-500">
            No payout adjustment has been computed yet.
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">Dates</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Created</dt>
              <dd className="font-medium text-slate-900">
                {IST_DATE_FORMATTER.format(data.payout._creationTime)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Disbursed</dt>
              <dd className="font-medium text-slate-900">
                {formatOptionalDate(data.payout.disbursed_at)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Voided</dt>
              <dd className="font-medium text-slate-900">
                {formatOptionalDate(data.payout.voided_at)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">Related</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {relatedItems.map((item) => (
              <div key={item.key} className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">{item.icon}</span>
                <span className="text-xs uppercase tracking-wide text-slate-500">{item.label}</span>
                <Link href={item.href} className="font-medium text-blue-600 hover:underline">
                  {item.text}
                </Link>
              </div>
            ))}
            <div className="pt-1 text-sm font-medium text-blue-600 hover:underline">
              {renderEntityLink(data.lead?._id, "Open Lead", `/admin/leads?id=${data.lead?._id}`)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">Guard Info</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium text-slate-900">
                {renderEntityLink(
                  data.guard?._id,
                  data.guard?.name ?? "—",
                  `/admin/guards/${data.guard?._id}`,
                )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd className="font-medium text-slate-900">{formatPhone(data.guard?.phone)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Dialog open={isOverrideDialogOpen} onOpenChange={setIsOverrideDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Override Payout Amount</DialogTitle>
            <DialogDescription>
              Enter a custom final amount in rupees. This updates the payout and adjustment final
              amount.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label htmlFor="override-amount" className="text-sm font-medium text-slate-700">
              Amount (₹)
            </label>
            <Input
              id="override-amount"
              type="number"
              min="0"
              step="0.01"
              value={overrideAmountRupees}
              onChange={(event) => setOverrideAmountRupees(event.target.value)}
              placeholder="Enter override amount"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOverrideDialogOpen(false)}
              disabled={isSubmittingOverride}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleOverrideSubmit()}
              disabled={isSubmittingOverride}
            >
              {isSubmittingOverride ? "Saving..." : "Save Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
