"use client";

import { ArrowUpDown } from "lucide-react";
import type { SortOption } from "@/lib/hooks/use-listing-filters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortDropdownProps = {
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
};

export function SortDropdown({ sort, onSortChange }: SortDropdownProps) {
  return (
    <Select value={sort} onValueChange={(v) => onSortChange(v as SortOption)}>
      <SelectTrigger className="h-9 w-[180px] rounded-lg border-slate-200 bg-white text-sm shadow-sm">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="size-3.5 text-slate-400" />
          <SelectValue placeholder="Sort by" />
        </div>
      </SelectTrigger>
      <SelectContent className="rounded-xl">
        <SelectItem value="newest">Newest First</SelectItem>
        <SelectItem value="freshness_first">Freshness First</SelectItem>
        <SelectItem value="price_asc">Price: Low to High</SelectItem>
        <SelectItem value="price_desc">Price: High to Low</SelectItem>
        <SelectItem value="area_desc">Area: Large to Small</SelectItem>
      </SelectContent>
    </Select>
  );
}
