"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type FilterTab = {
  key: string;
  label: string;
};

type LeadFilterTabsProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
};

export function LeadFilterTabs({ activeTab, onTabChange }: LeadFilterTabsProps) {
  const t = useTranslations("guard.leads");
  const FILTER_TABS: FilterTab[] = [
    { key: "ALL", label: t("all") },
    { key: "IN_REVIEW", label: t("inReview") },
    { key: "VERIFIED", label: t("verified") },
    { key: "REJECTED", label: t("rejected") },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {FILTER_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange(tab.key)}
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            activeTab === tab.key
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
