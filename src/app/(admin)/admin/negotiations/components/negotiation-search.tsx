"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type NegotiationSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export function NegotiationSearch({ value, onChange }: NegotiationSearchProps) {
  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by listing, tenant, or owner"
        className="pl-9"
      />
    </div>
  );
}
