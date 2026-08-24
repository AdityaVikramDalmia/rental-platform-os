"use client";

import { LEAD_STATUS, type LeadStatus } from "../../../../../../lib/constants";
import { cn } from "@/lib/utils";

type TabItem = {
  label: string;
  value: LeadStatus | "ALL";
};

const TAB_ITEMS: TabItem[] = [
  { label: "All", value: "ALL" },
  { label: "Submitted", value: LEAD_STATUS.SUBMITTED },
  { label: "Need Info", value: LEAD_STATUS.NEED_INFO },
  { label: "Duplicates?", value: LEAD_STATUS.POTENTIAL_DUPLICATE },
  { label: "Verified", value: LEAD_STATUS.VERIFIED },
  { label: "Rejected", value: LEAD_STATUS.REJECTED },
];

type LeadStatusTabsProps = {
  activeTab: LeadStatus | "ALL";
  counts: Record<string, number> | undefined;
  onTabChange: (tab: LeadStatus | "ALL") => void;
};

export function LeadStatusTabs({ activeTab, counts, onTabChange }: LeadStatusTabsProps) {
  const totalCount = counts ? Object.values(counts).reduce((sum, count) => sum + count, 0) : 0;

  function getCount(value: LeadStatus | "ALL"): number {
    if (!counts) return 0;
    if (value === "ALL") return totalCount;
    return counts[value] ?? 0;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {TAB_ITEMS.map((tab) => {
        const isActive = activeTab === tab.value;
        const count = getCount(tab.value);

        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onTabChange(tab.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            {tab.label}
            {counts !== undefined && (
              <span
                className={cn(
                  "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                  isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
