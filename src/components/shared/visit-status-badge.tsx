"use client";

import { VISIT_STATUS, VISIT_STATUS_COLORS, type VisitStatus } from "../../../lib/constants";
import { cn } from "@/lib/utils";

const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  [VISIT_STATUS.ASSIGNED]: "Assigned",
  [VISIT_STATUS.CONFIRMED]: "Confirmed",
  [VISIT_STATUS.IN_PROGRESS]: "In Progress",
  [VISIT_STATUS.COMPLETED]: "Completed",
  [VISIT_STATUS.CANCELLED]: "Cancelled",
  [VISIT_STATUS.NO_SHOW]: "No-Show",
};

type VisitStatusBadgeProps = {
  status: VisitStatus;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function VisitStatusBadge({ status, label, size = "sm", className }: VisitStatusBadgeProps) {
  const colorClasses = VISIT_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600";
  const displayLabel = label ?? VISIT_STATUS_LABELS[status] ?? status;

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
