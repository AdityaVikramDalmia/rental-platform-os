"use client";

import {
  TENANT_INQUIRY_STATUS,
  TENANT_INQUIRY_STATUS_COLORS,
  TENANT_INQUIRY_STATUS_LABELS,
  type TenantInquiryStatus,
} from "../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type InquiryStatusBadgeProps = {
  status: string;
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

const FALLBACK_CLASSES = "bg-gray-100 text-gray-600";

export function InquiryStatusBadge({
  status,
  label,
  size = "sm",
  className,
}: InquiryStatusBadgeProps) {
  const typedStatus = status as TenantInquiryStatus;
  const colorClasses = TENANT_INQUIRY_STATUS_COLORS[typedStatus] ?? FALLBACK_CLASSES;
  const displayLabel = label ?? TENANT_INQUIRY_STATUS_LABELS[typedStatus] ?? status;

  return (
    <Badge
      className={cn(
        "border-transparent font-semibold",
        size === "sm" && "px-2.5 py-0.5 text-xs",
        size === "md" && "px-3 py-1 text-sm",
        colorClasses,
        className,
      )}
    >
      {displayLabel}
    </Badge>
  );
}

export const INQUIRY_STATUS_ORDER: readonly TenantInquiryStatus[] = [
  TENANT_INQUIRY_STATUS.SUBMITTED,
  TENANT_INQUIRY_STATUS.REVIEWED,
  TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
  TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
  TENANT_INQUIRY_STATUS.VISIT_SCHEDULED,
  TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
  TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
  TENANT_INQUIRY_STATUS.CLOSED,
  TENANT_INQUIRY_STATUS.REJECTED,
  TENANT_INQUIRY_STATUS.EXPIRED,
] as const;
