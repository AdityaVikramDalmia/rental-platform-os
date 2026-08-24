"use client";

import { LISTING_STATUS, LISTING_STATUS_COLORS, type ListingStatus } from "../../../lib/constants";
import { cn } from "@/lib/utils";

const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  [LISTING_STATUS.DRAFT]: "Draft",
  [LISTING_STATUS.PUBLISHED]: "Published",
  [LISTING_STATUS.ARCHIVED]: "Archived",
};

type ListingStatusBadgeProps = {
  status: string;
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

export function ListingStatusBadge({
  status,
  label,
  size = "sm",
  className,
}: ListingStatusBadgeProps) {
  const colorClasses =
    LISTING_STATUS_COLORS[status as ListingStatus] ?? "bg-gray-100 text-gray-600";
  const displayLabel = label ?? LISTING_STATUS_LABELS[status as ListingStatus] ?? status;

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
