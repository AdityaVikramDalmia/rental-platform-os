"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DashboardTimeWindow = "last_7_days" | "last_30_days" | "last_90_days" | "all_time";

const TIME_WINDOW_OPTIONS: Array<{ label: string; value: DashboardTimeWindow }> = [
  { label: "7D", value: "last_7_days" },
  { label: "30D", value: "last_30_days" },
  { label: "90D", value: "last_90_days" },
  { label: "All", value: "all_time" },
];

type TimeWindowSelectorProps = {
  value: DashboardTimeWindow;
  action: (value: DashboardTimeWindow) => void;
  className?: string;
};

export function TimeWindowSelector({ value, action, className }: TimeWindowSelectorProps) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2",
        className,
      )}
      role="group"
      aria-label="Select analytics time window"
    >
      {TIME_WINDOW_OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={value === option.value ? "default" : "outline"}
          onClick={() => action(option.value)}
          className="h-9 min-w-14"
          aria-pressed={value === option.value}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
