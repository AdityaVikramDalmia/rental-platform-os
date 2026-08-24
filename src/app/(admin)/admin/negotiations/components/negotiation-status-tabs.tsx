"use client";

import { NEGOTIATION_STATUS, NEGOTIATION_STATUS_LABELS } from "../../../../../../lib/constants";
import { cn } from "@/lib/utils";

export type NegotiationStatusFilter =
  | "ALL"
  | (typeof NEGOTIATION_STATUS)[keyof typeof NEGOTIATION_STATUS];

type NegotiationStatusTabsProps = {
  activeStatus: NegotiationStatusFilter;
  counts: Record<string, number> | undefined;
  onChange: (status: NegotiationStatusFilter) => void;
};

const STATUS_VALUES = Object.values(NEGOTIATION_STATUS);

export function NegotiationStatusTabs({
  activeStatus,
  counts,
  onChange,
}: NegotiationStatusTabsProps) {
  const totalCount = STATUS_VALUES.reduce((sum, status) => sum + (counts?.[status] ?? 0), 0);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange("ALL")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
          activeStatus === "ALL"
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
        )}
      >
        All
        <span
          className={cn(
            "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
            activeStatus === "ALL" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700",
          )}
        >
          {totalCount}
        </span>
      </button>

      {STATUS_VALUES.map((status) => {
        const isActive = status === activeStatus;

        return (
          <button
            key={status}
            type="button"
            onClick={() => onChange(status)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            {NEGOTIATION_STATUS_LABELS[status]}
            <span
              className={cn(
                "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700",
              )}
            >
              {counts?.[status] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
