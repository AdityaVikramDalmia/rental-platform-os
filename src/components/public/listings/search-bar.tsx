"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  variant?: "hero" | "toolbar";
  className?: string;
};

export function SearchBar({
  value,
  onChange,
  onClear,
  variant = "toolbar",
  className,
}: SearchBarProps) {
  const isHero = variant === "hero";

  return (
    <div className={cn("relative w-full", isHero ? "max-w-2xl" : "sm:max-w-sm", className)}>
      <Search
        className={cn(
          "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2",
          isHero ? "size-5 text-slate-400" : "size-4 text-slate-400",
        )}
      />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by society, locality, or city..."
        className={cn(
          "pr-10",
          isHero
            ? "h-14 rounded-2xl border-white/20 bg-white/10 pl-12 text-base text-white placeholder:text-slate-400 backdrop-blur-sm focus-visible:border-blue-400 focus-visible:ring-blue-400/30"
            : "h-10 rounded-xl border-slate-200 bg-white pl-10 text-sm shadow-sm focus-visible:border-blue-500 focus-visible:ring-blue-500/20",
        )}
      />
      {value.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2",
            isHero
              ? "size-8 text-slate-400 hover:bg-white/10 hover:text-white"
              : "size-7 text-slate-400 hover:text-slate-600",
          )}
          onClick={onClear}
          aria-label="Clear search"
        >
          <X className={isHero ? "size-4" : "size-3.5"} />
        </Button>
      )}
    </div>
  );
}
