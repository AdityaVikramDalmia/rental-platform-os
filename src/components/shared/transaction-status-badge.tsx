"use client";

import {
  TRANSACTION_STATUS_COLORS,
  TRANSACTION_STATUS_LABELS,
  type TransactionStatus,
} from "../../../lib/constants";
import { cn } from "@/lib/utils";

type TransactionStatusBadgeProps = {
  status: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function TransactionStatusBadge({
  status,
  label,
  size = "sm",
  className,
}: TransactionStatusBadgeProps) {
  const typedStatus = status as TransactionStatus;
  const colorClasses = TRANSACTION_STATUS_COLORS[typedStatus] ?? "bg-gray-100 text-gray-600";
  const displayLabel = label ?? TRANSACTION_STATUS_LABELS[typedStatus] ?? status;

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
