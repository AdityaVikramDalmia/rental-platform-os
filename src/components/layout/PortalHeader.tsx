"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PortalHeaderProps {
  portalLabel: string;
  brandLabel: string;
  accentClassName?: string;
  userName?: string;
  rightSlot?: ReactNode;
}

export function PortalHeader({
  portalLabel,
  brandLabel,
  accentClassName,
  userName,
  rightSlot,
}: PortalHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {brandLabel}
          </p>
          <p className={cn("truncate text-lg font-semibold text-slate-900", accentClassName)}>
            {portalLabel}
          </p>
        </div>
        {(userName || rightSlot) && (
          <div className="flex items-center gap-2">
            {userName && (
              <span className="truncate text-sm font-medium text-slate-600">{userName}</span>
            )}
            {rightSlot}
          </div>
        )}
      </div>
    </header>
  );
}
