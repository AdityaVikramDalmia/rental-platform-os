"use client";

import {
  TENANT_INQUIRY_STATUS,
  TENANT_INQUIRY_STATUS_LABELS,
  type TenantInquiryStatus,
} from "../../../../lib/constants";
import { formatDateTime } from "../../../../lib/dates";
import { cn } from "@/lib/utils";

const MAIN_TIMELINE: TenantInquiryStatus[] = [
  TENANT_INQUIRY_STATUS.SUBMITTED,
  TENANT_INQUIRY_STATUS.REVIEWED,
  TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
  TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
  TENANT_INQUIRY_STATUS.VISIT_SCHEDULED,
  TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
  TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
  TENANT_INQUIRY_STATUS.CLOSED,
];

type InquiryTimelineData = {
  status: TenantInquiryStatus;
  _creationTime: number;
  bounty_posted_at?: number;
  updated_at?: number;
  reviewed_by_admin_id?: string;
  visit?: {
    scheduled_start: number;
    completed_at?: number;
  } | null;
};

type InquiryTimelineProps = {
  inquiry: InquiryTimelineData;
};

function getTimestampForStatus(
  inquiry: InquiryTimelineData,
  status: TenantInquiryStatus,
): number | undefined {
  if (status === TENANT_INQUIRY_STATUS.SUBMITTED) return inquiry._creationTime;
  if (status === TENANT_INQUIRY_STATUS.BOUNTY_POSTED) return inquiry.bounty_posted_at;
  if (status === TENANT_INQUIRY_STATUS.VISIT_SCHEDULED) return inquiry.visit?.scheduled_start;
  if (status === TENANT_INQUIRY_STATUS.VISIT_COMPLETED) return inquiry.visit?.completed_at;
  if (status === TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED) {
    return inquiry.status === TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED ||
      inquiry.status === TENANT_INQUIRY_STATUS.CLOSED
      ? inquiry.updated_at
      : undefined;
  }
  if (status === TENANT_INQUIRY_STATUS.CLOSED && inquiry.status === TENANT_INQUIRY_STATUS.CLOSED) {
    return inquiry.updated_at;
  }
  if (status === TENANT_INQUIRY_STATUS.REVIEWED && inquiry.reviewed_by_admin_id) {
    return inquiry.updated_at;
  }
  return undefined;
}

export function InquiryTimeline({ inquiry }: InquiryTimelineProps) {
  const currentIndex = MAIN_TIMELINE.indexOf(inquiry.status);
  const isRejected = inquiry.status === TENANT_INQUIRY_STATUS.REJECTED;
  const isExpired = inquiry.status === TENANT_INQUIRY_STATUS.EXPIRED;

  const terminalCutoff = isExpired
    ? MAIN_TIMELINE.indexOf(TENANT_INQUIRY_STATUS.BOUNTY_POSTED)
    : isRejected
      ? MAIN_TIMELINE.indexOf(TENANT_INQUIRY_STATUS.REVIEWED)
      : currentIndex;

  return (
    <div className="space-y-3">
      {MAIN_TIMELINE.map((step, index) => {
        const isCompleted =
          index < currentIndex || (isRejected || isExpired ? index <= terminalCutoff : false);
        const isActive = !isRejected && !isExpired && index === currentIndex;
        const timestamp = getTimestampForStatus(inquiry, step);

        return (
          <div key={step} className="flex items-start gap-3">
            <div className="mt-0.5 flex flex-col items-center">
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  isCompleted && "bg-cyan-600",
                  isActive && "bg-cyan-500 ring-4 ring-cyan-100",
                  !isCompleted && !isActive && "bg-slate-200",
                )}
              />
              {index < MAIN_TIMELINE.length - 1 ? (
                <span className="mt-1 block h-5 w-px bg-slate-200" />
              ) : null}
            </div>

            <div>
              <p
                className={cn(
                  "text-sm",
                  isCompleted || isActive ? "font-semibold text-slate-900" : "text-slate-500",
                )}
              >
                {TENANT_INQUIRY_STATUS_LABELS[step]}
              </p>
              <p className="text-xs text-slate-500">
                {timestamp ? formatDateTime(timestamp) : "Pending"}
              </p>
            </div>
          </div>
        );
      })}

      {isRejected || isExpired ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Terminal status: {TENANT_INQUIRY_STATUS_LABELS[inquiry.status]}
        </div>
      ) : null}
    </div>
  );
}
