"use client";

import { CLOSURE_STATUS, CLOSURE_STATUS_COLORS, type ClosureStatus } from "../../../lib/constants";
import { cn } from "@/lib/utils";

const CLOSURE_STATUS_LABELS: Record<ClosureStatus, string> = {
  [CLOSURE_STATUS.PENDING]: "Pending",
  [CLOSURE_STATUS.CONFIRMED]: "Confirmed",
  [CLOSURE_STATUS.CANCELLED]: "Cancelled",
};

type ClosureStatusBadgeProps = {
  status: ClosureStatus;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function ClosureStatusBadge({
  status,
  label,
  size = "sm",
  className,
}: ClosureStatusBadgeProps) {
  const colorClasses = CLOSURE_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600";
  const displayLabel = label ?? CLOSURE_STATUS_LABELS[status] ?? status;

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
