"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BulkAction = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive" | "outline";
  disabled?: boolean;
};

type BulkActionBarProps = {
  selectedCount: number;
  actions: BulkAction[];
  clearAction: () => void;
};

export function BulkActionBar({ selectedCount, actions, clearAction }: BulkActionBarProps) {
  const isVisible = selectedCount > 0;

  return (
    <div
      data-visible={isVisible}
      aria-hidden={!isVisible}
      className={cn(
        "fixed bottom-0 left-[var(--sidebar-width,0px)] right-0 z-50 flex items-center gap-3 border-t border-border bg-background px-6 py-3 shadow-lg transition-transform duration-200",
        isVisible ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
    >
      <p className="text-sm font-medium text-foreground">{selectedCount} selected</p>

      {actions.map((action) => (
        <Button
          key={action.label}
          type="button"
          size="sm"
          variant={action.variant ?? "default"}
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.icon}
          {action.label}
        </Button>
      ))}

      <Button type="button" variant="ghost" size="sm" onClick={clearAction} className="ml-auto">
        Clear selection
      </Button>
    </div>
  );
}
