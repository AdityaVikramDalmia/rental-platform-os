"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type GuardAvailabilityGridProps = {
  society_id: Id<"societies">;
  building_id: Id<"buildings">;
  date: number;
  time_start: number;
  time_end: number;
  value: Id<"users"> | undefined;
  onChange: (guardId: Id<"users">, guardName?: string) => void;
};

const INDICATOR_CONFIG: Record<
  string,
  { icon: string; label: string; color: string; disabled: boolean }
> = {
  ON_SHIFT_SAME_BUILDING: {
    icon: "\u2705",
    label: "On shift",
    color: "text-green-700 bg-green-50 border-green-200",
    disabled: false,
  },
  ON_SHIFT_DIFFERENT_LOCATION: {
    icon: "\u26A0\uFE0F",
    label: "On shift",
    color: "text-amber-700 bg-amber-50 border-amber-200",
    disabled: false,
  },
  OFF_DUTY: {
    icon: "\u26A0\uFE0F",
    label: "Off duty",
    color: "text-amber-700 bg-amber-50 border-amber-200",
    disabled: false,
  },
  INACTIVE: {
    icon: "\u274C",
    label: "INACTIVE",
    color: "text-gray-400 bg-gray-50 border-gray-200",
    disabled: true,
  },
  BANNED: {
    icon: "\u274C",
    label: "BANNED",
    color: "text-gray-400 bg-gray-50 border-gray-200",
    disabled: true,
  },
};

const GUARD_TYPE_LABELS: Record<string, string> = {
  BUILDING_SPECIFIC: "Building",
  MAIN_GATE: "Main Gate",
  PARK: "Park",
  ROVING: "Roving",
};

export function GuardAvailabilityGrid({
  society_id,
  building_id,
  date,
  time_start,
  time_end,
  value,
  onChange,
}: GuardAvailabilityGridProps) {
  const availability = useQuery(api.visits.getGuardAvailability, {
    society_id,
    building_id,
    date,
    time_start,
    time_end,
  });

  if (availability === undefined) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={`guard-skel-${i}`}
            className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"
          >
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="ml-auto h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (availability.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500">
        No guards found in this society
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {availability.map((guard) => {
        const config = INDICATOR_CONFIG[guard.availability_indicator] ?? INDICATOR_CONFIG.OFF_DUTY;
        const isSelected = value === guard.guard_id;
        const isDisabled = config.disabled;
        const locationText = guard.shift_location ? `(${guard.shift_location})` : "";

        return (
          <button
            key={guard.guard_id}
            type="button"
            disabled={isDisabled}
            onClick={() => onChange(guard.guard_id as Id<"users">, guard.guard_name)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
              isDisabled && "cursor-not-allowed opacity-50",
              isSelected && !isDisabled && "border-slate-900 bg-slate-50 ring-1 ring-slate-900",
              !isSelected &&
                !isDisabled &&
                "border-slate-200 hover:border-slate-400 hover:bg-slate-50",
            )}
          >
            <div
              className={cn(
                "flex size-4 items-center justify-center rounded-full border-2",
                isSelected ? "border-slate-900 bg-slate-900" : "border-slate-300",
              )}
            >
              {isSelected && <div className="size-1.5 rounded-full bg-white" />}
            </div>

            <div className="min-w-0 flex-1">
              <span className="font-medium text-slate-900">{guard.guard_name}</span>
              {guard.guard_type && (
                <span className="ml-2 text-xs text-slate-500">
                  {GUARD_TYPE_LABELS[guard.guard_type] ?? guard.guard_type}
                </span>
              )}
            </div>

            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                config.color,
              )}
            >
              {config.icon} {config.label} {locationText}
            </span>
          </button>
        );
      })}
    </div>
  );
}
