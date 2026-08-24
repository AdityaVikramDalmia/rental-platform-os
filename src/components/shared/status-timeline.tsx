"use client";

import { formatDateTime } from "../../../lib/dates";
import { cn } from "@/lib/utils";

type TimelineEntry = {
  status: string;
  label: string;
  timestamp: number;
  isCurrent?: boolean;
};

type StatusTimelineProps = {
  entries: TimelineEntry[];
  className?: string;
};

const STATUS_DOT_COLORS: Record<string, string> = {
  SUBMITTED: "bg-blue-500",
  NEED_INFO: "bg-amber-500",
  POTENTIAL_DUPLICATE: "bg-yellow-500",
  VERIFIED: "bg-emerald-500",
  REJECTED: "bg-red-500",
  DUPLICATE: "bg-gray-400",
};

export function StatusTimeline({ entries, className }: StatusTimelineProps) {
  if (entries.length === 0) {
    return <p className={cn("text-sm text-slate-400 italic", className)}>No status history.</p>;
  }

  return (
    <div className={cn("relative", className)}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const dotColor = STATUS_DOT_COLORS[entry.status] ?? "bg-slate-400";

        return (
          <div
            key={`${entry.status}-${entry.timestamp}-${index}`}
            className="relative flex gap-3 pb-4"
          >
            {!isLast && <div className="absolute left-[7px] top-4 h-full w-0.5 bg-slate-200" />}
            <div className="relative z-10 flex-shrink-0 pt-0.5">
              <div
                className={cn(
                  "size-[15px] rounded-full border-2 border-white shadow-sm",
                  dotColor,
                  entry.isCurrent && "ring-2 ring-offset-1 ring-slate-300",
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  entry.isCurrent ? "text-slate-900" : "text-slate-600",
                )}
              >
                {entry.label}
              </p>
              <p className="text-xs text-slate-400">{formatDateTime(entry.timestamp)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
