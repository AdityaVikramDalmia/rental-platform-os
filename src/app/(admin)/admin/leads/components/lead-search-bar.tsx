"use client";

import { Search } from "lucide-react";
import type { RefObject } from "react";
import { Input } from "@/components/ui/input";

type LeadSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
};

export function LeadSearchBar({ value, onChange, inputRef }: LeadSearchBarProps) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by flat, phone, guard name..."
        className="h-10 border-slate-300 pl-9"
      />
    </div>
  );
}
