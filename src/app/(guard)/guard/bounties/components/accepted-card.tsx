"use client";

import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  TENANT_INQUIRY_STATUS,
  TENANT_INQUIRY_STATUS_COLORS,
  TENANT_INQUIRY_STATUS_LABELS,
  type TenantInquiryStatus,
} from "../../../../../../lib/constants";
import { formatDateTime } from "../../../../../../lib/dates";
import { paiseToRupees } from "../../../../../../lib/money";
import { Home, IndianRupee } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AcceptedCardProps = {
  bounty: {
    _id: Id<"tenant_inquiries">;
    listing_bhk: string | null;
    listing_rent: number | null;
    building_name: string | null;
    society_name: string | null;
    floor_number: string | null;
    flat_number: string | null;
    preferred_visit_date?: number;
    preferred_visit_slot?: string;
    bounty_amount?: number;
    bounty_expires_at?: number;
    status: TenantInquiryStatus;
    visit?: {
      scheduled_start: number;
      scheduled_end: number;
      outcome?: string;
    } | null;
  };
};

const STATUS_PROGRESS_FLOW: TenantInquiryStatus[] = [
  TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
  TENANT_INQUIRY_STATUS.VISIT_SCHEDULED,
  TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
  TENANT_INQUIRY_STATUS.CLOSED,
];

function getProgressIndex(status: TenantInquiryStatus): number {
  if (status === TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED) {
    return STATUS_PROGRESS_FLOW.indexOf(TENANT_INQUIRY_STATUS.VISIT_COMPLETED);
  }

  const directIndex = STATUS_PROGRESS_FLOW.indexOf(status);
  return directIndex >= 0 ? directIndex : -1;
}

function getOutcomeLabel(outcome: string | undefined): string {
  if (!outcome) return "Pending";
  return outcome
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function AcceptedCard({ bounty }: AcceptedCardProps) {
  const addressLine = [
    bounty.building_name ?? "Building",
    bounty.floor_number ? `Fl ${bounty.floor_number}` : null,
    bounty.flat_number ? `#${bounty.flat_number}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const progressIndex = getProgressIndex(bounty.status);
  const bountyAmount =
    bounty.bounty_amount !== undefined ? `₹${paiseToRupees(bounty.bounty_amount)}` : "TBD";

  return (
    <Card className="gap-0 border-slate-200 py-4">
      <CardContent className="space-y-3 px-4">
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <Home className="mt-0.5 size-4 shrink-0 text-slate-500" />
            <div>
              <p className="text-base font-semibold text-slate-900">{addressLine}</p>
              <p className="text-sm text-slate-500">{bounty.society_name ?? "Society"}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
          <IndianRupee className="size-4" />
          <span>Bounty: {bountyAmount}</span>
        </div>

        <div className="space-y-2 rounded-lg bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-600">Progress</p>
          <Badge className={TENANT_INQUIRY_STATUS_COLORS[bounty.status]}>
            {TENANT_INQUIRY_STATUS_LABELS[bounty.status] ?? bounty.status}
          </Badge>

          <div className="space-y-1.5">
            {STATUS_PROGRESS_FLOW.map((step, index) => {
              const isDone = index < progressIndex;
              const isCurrent = index === progressIndex;

              return (
                <div key={step} className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      isDone && "bg-emerald-600",
                      isCurrent && "bg-blue-600",
                      !isDone && !isCurrent && "bg-slate-300",
                    )}
                  />
                  <span
                    className={cn(
                      "font-medium",
                      isDone || isCurrent ? "text-slate-800" : "text-slate-500",
                    )}
                  >
                    {TENANT_INQUIRY_STATUS_LABELS[step]}
                  </span>
                </div>
              );
            })}
          </div>

          {bounty.visit && bounty.status === TENANT_INQUIRY_STATUS.VISIT_SCHEDULED && (
            <p className="text-xs text-slate-700">
              Visit: {formatDateTime(bounty.visit.scheduled_start)} -{" "}
              {formatDateTime(bounty.visit.scheduled_end)}
            </p>
          )}

          {bounty.visit &&
            (bounty.status === TENANT_INQUIRY_STATUS.VISIT_COMPLETED ||
              bounty.status === TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED ||
              bounty.status === TENANT_INQUIRY_STATUS.CLOSED) && (
              <p className="text-xs text-slate-700">
                Outcome: {getOutcomeLabel(bounty.visit.outcome)}
              </p>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
