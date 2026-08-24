"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type VisitSectionProps = {
  title: string;
  count: number;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  highlighted?: boolean;
  children: React.ReactNode;
};

export function VisitSection({
  title,
  count,
  collapsible = false,
  defaultCollapsed = false,
  highlighted = false,
  children,
}: VisitSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div>
      <button
        type="button"
        disabled={!collapsible}
        onClick={() => collapsible && setCollapsed(!collapsed)}
        className={cn("mb-3 flex w-full items-center gap-2", collapsible && "cursor-pointer")}
      >
        <h2
          className={cn(
            "text-sm font-bold uppercase tracking-wide",
            highlighted ? "text-amber-700" : "text-slate-500",
          )}
        >
          {title}
        </h2>
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full text-xs font-bold",
            highlighted ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600",
          )}
        >
          {count}
        </span>
        {collapsible &&
          (collapsed ? (
            <ChevronDown className="ml-auto size-4 text-slate-400" />
          ) : (
            <ChevronUp className="ml-auto size-4 text-slate-400" />
          ))}
      </button>

      {!collapsed && <div className="space-y-3">{children}</div>}
    </div>
  );
}
