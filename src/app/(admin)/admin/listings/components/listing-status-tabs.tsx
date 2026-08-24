"use client";

import { LISTING_STATUS, type ListingStatus } from "../../../../../../lib/constants";
import { cn } from "@/lib/utils";

type TabItem = {
  label: string;
  value: ListingStatus | "ALL";
};

const TAB_ITEMS: TabItem[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: LISTING_STATUS.DRAFT },
  { label: "Published", value: LISTING_STATUS.PUBLISHED },
  { label: "Archived", value: LISTING_STATUS.ARCHIVED },
];

type ListingStatusTabsProps = {
  activeTab: ListingStatus | "ALL";
  onTabChange: (tab: ListingStatus | "ALL") => void;
};

export function ListingStatusTabs({ activeTab, onTabChange }: ListingStatusTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TAB_ITEMS.map((tab) => {
        const isActive = activeTab === tab.value;

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
          </button>
        );
      })}
    </div>
  );
}
