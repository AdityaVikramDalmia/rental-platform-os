"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChannelTab = "all" | "ACTIVE" | "ARCHIVED";

const CHANNEL_TABS: { key: ChannelTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "ARCHIVED", label: "Archived" },
];

type ChannelStatusTabsProps = {
  activeTab: ChannelTab;
  onTabChange: (tab: ChannelTab) => void;
  counts?: { active: number; archived: number; total: number };
};

export function ChannelStatusTabs({ activeTab, onTabChange, counts }: ChannelStatusTabsProps) {
  function getCount(tab: ChannelTab): number | undefined {
    if (!counts) return undefined;
    if (tab === "all") return counts.total;
    if (tab === "ACTIVE") return counts.active;
    if (tab === "ARCHIVED") return counts.archived;
    return undefined;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {CHANNEL_TABS.map((tab) => {
        const count = getCount(tab.key);
        return (
          <Button
            key={tab.key}
            type="button"
            variant={activeTab === tab.key ? "default" : "outline"}
            size="sm"
            onClick={() => onTabChange(tab.key)}
            className={cn(
              "gap-1.5",
              activeTab === tab.key
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "border-slate-300 text-slate-700",
            )}
          >
            {tab.label}
            {count !== undefined && (
              <span
                className={cn(
                  "ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                  activeTab === tab.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600",
                )}
              >
                {count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
