"use client";

import Link from "next/link";
import type { Id } from "../../../../convex/_generated/dataModel";
import { TENANT_INQUIRY_STATUS_LABELS, type TenantInquiryStatus } from "../../../../lib/constants";
import { formatDate, formatDateTime, formatRelativeTime } from "../../../../lib/dates";
import { formatINR } from "../../../../lib/money";
import { InquiryStatusBadge } from "@/components/shared/inquiry-status-badge";
import { Card, CardContent } from "@/components/ui/card";

type InquiryListItemData = {
  inquiry_id: Id<"tenant_inquiries">;
  created_at: number;
  status: TenantInquiryStatus;
  preferred_visit_date?: number;
  preferred_visit_slot?: string;
  listing?: {
    title?: string;
    slug?: string;
    bhk_config?: string;
    rent_monthly?: number;
  } | null;
  building_name?: string | null;
  society_name?: string | null;
  visit?: {
    status: string;
    scheduled_start: number;
  } | null;
};

type InquiryListItemProps = {
  inquiry: InquiryListItemData;
};

export function InquiryListItem({ inquiry }: InquiryListItemProps) {
  return (
    <Link href={`/tenant/inquiries/${inquiry.inquiry_id}`}>
      <Card className="border-slate-200 transition-colors hover:border-cyan-300">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {inquiry.listing?.title ?? inquiry.building_name ?? "Listing"}
                {inquiry.listing?.bhk_config ? ` - ${inquiry.listing.bhk_config}` : ""}
              </p>
              <p className="text-xs text-slate-500">
                {inquiry.society_name ?? "Society"} - {formatRelativeTime(inquiry.created_at)}
              </p>
            </div>
            <InquiryStatusBadge
              status={inquiry.status}
              label={TENANT_INQUIRY_STATUS_LABELS[inquiry.status]}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
            <p>
              <span className="font-medium text-slate-700">Preferred:</span>{" "}
              {inquiry.preferred_visit_date ? formatDate(inquiry.preferred_visit_date) : "ASAP"}
            </p>
            <p>
              <span className="font-medium text-slate-700">Slot:</span>{" "}
              {inquiry.preferred_visit_slot ?? "Any"}
            </p>
            <p>
              <span className="font-medium text-slate-700">Rent:</span>{" "}
              {inquiry.listing?.rent_monthly ? formatINR(inquiry.listing.rent_monthly) : "-"}
            </p>
            <p>
              <span className="font-medium text-slate-700">Visit:</span>{" "}
              {inquiry.visit
                ? `${inquiry.visit.status} (${formatDateTime(inquiry.visit.scheduled_start)})`
                : "Not scheduled"}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
