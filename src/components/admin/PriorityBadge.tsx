"use client";

import { cn } from "@/lib/utils";

type PriorityTier = "HIGH" | "MEDIUM" | "LOW";

type PriorityBadgeProps = {
  tier: PriorityTier;
  score?: number;
};

const PRIORITY_STYLES: Record<
  PriorityTier,
  {
    label: string;
    text: string;
    pill: string;
    dot: string;
  }
> = {
  HIGH: {
    label: "High",
    text: "text-red-700 font-semibold",
    pill: "bg-red-50 border border-red-200",
    dot: "bg-red-500",
  },
  MEDIUM: {
    label: "Medium",
    text: "text-amber-700",
    pill: "bg-amber-50 border border-amber-200",
    dot: "bg-amber-500",
  },
  LOW: {
    label: "Low",
    text: "text-gray-500",
    pill: "bg-gray-50 border border-gray-200",
    dot: "bg-gray-500",
  },
};

export function PriorityBadge({ tier, score }: PriorityBadgeProps) {
  const styles = PRIORITY_STYLES[tier];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs",
        styles.pill,
        styles.text,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full inline-block mr-1.5", styles.dot)} />
      {styles.label}
      {typeof score === "number" ? ` (${score})` : ""}
    </span>
  );
}
