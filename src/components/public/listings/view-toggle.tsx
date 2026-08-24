"use client";

import { LayoutGrid, List } from "lucide-react";
import type { ViewMode } from "@/lib/hooks/use-view-mode";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type ViewToggleProps = {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
};

export function ViewToggle({ viewMode, setViewMode }: ViewToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={viewMode}
      onValueChange={(v) => {
        if (v) setViewMode(v as ViewMode);
      }}
      variant="outline"
      className="rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <ToggleGroupItem
        value="grid"
        aria-label="Grid view"
        className="rounded-l-lg data-[state=on]:bg-blue-50 data-[state=on]:text-blue-600"
      >
        <LayoutGrid className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="list"
        aria-label="List view"
        className="rounded-r-lg data-[state=on]:bg-blue-50 data-[state=on]:text-blue-600"
      >
        <List className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
