"use client";

import { PAYOUT_STATUS, PAYOUT_STATUS_COLORS, type PayoutStatus } from "../../../lib/constants";
import { cn } from "@/lib/utils";

const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  [PAYOUT_STATUS.PENDING]: "Pending",
  [PAYOUT_STATUS.APPROVED]: "Approved",
  [PAYOUT_STATUS.DISBURSED]: "Disbursed",
  [PAYOUT_STATUS.FAILED]: "Failed",
  [PAYOUT_STATUS.VOIDED]: "Voided",
};

type PayoutStatusBadgeProps = {
  status: PayoutStatus;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function PayoutStatusBadge({
  status,
  label,
  size = "sm",
  className,
}: PayoutStatusBadgeProps) {
  const colorClasses = PAYOUT_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600";
  const displayLabel = label ?? PAYOUT_STATUS_LABELS[status] ?? status;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold",
        size === "sm" && "px-2.5 py-0.5 text-xs",
        size === "md" && "px-3 py-1 text-sm",
        size === "lg" && "px-3.5 py-1.5 text-base",
        colorClasses,
        className,
      )}
    >
      {displayLabel}
    </span>
  );
}
