"use client";

import { LEAD_STATUS, LEAD_STATUS_COLORS, type LeadStatus } from "../../../lib/constants";
import { cn } from "@/lib/utils";

const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  [LEAD_STATUS.SUBMITTED]: "Submitted",
  [LEAD_STATUS.NEED_INFO]: "Need Info",
  [LEAD_STATUS.POTENTIAL_DUPLICATE]: "Potential Duplicate",
  [LEAD_STATUS.VERIFIED]: "Verified",
  [LEAD_STATUS.REJECTED]: "Rejected",
  [LEAD_STATUS.DUPLICATE]: "Duplicate",
};

type LeadStatusBadgeProps = {
  status: string;
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

export function LeadStatusBadge({ status, label, size = "sm", className }: LeadStatusBadgeProps) {
  const colorClasses = LEAD_STATUS_COLORS[status as LeadStatus] ?? "bg-gray-100 text-gray-600";
  const displayLabel = label ?? LEAD_STATUS_LABELS[status as LeadStatus] ?? status;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold",
        size === "sm" && "px-2.5 py-0.5 text-xs",
        size === "md" && "px-3 py-1 text-sm",
        colorClasses,
        className,
      )}
    >
      {displayLabel}
    </span>
  );
}
