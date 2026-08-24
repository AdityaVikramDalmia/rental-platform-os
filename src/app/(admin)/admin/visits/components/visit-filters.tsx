"use client";

import { useQuery } from "convex/react";
import { useCallback } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { VISIT_STATUS, type VisitStatus } from "../../../../../../lib/constants";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS: { label: string; value: VisitStatus | "" }[] = [
  { label: "All Statuses", value: "" },
  { label: "Assigned", value: VISIT_STATUS.ASSIGNED },
  { label: "Confirmed", value: VISIT_STATUS.CONFIRMED },
  { label: "In Progress", value: VISIT_STATUS.IN_PROGRESS },
  { label: "Completed", value: VISIT_STATUS.COMPLETED },
  { label: "Cancelled", value: VISIT_STATUS.CANCELLED },
  { label: "No-Show", value: VISIT_STATUS.NO_SHOW },
];

type VisitFiltersProps = {
  status?: VisitStatus;
  societyId?: Id<"societies">;
  guardId?: Id<"users">;
  needsReassignment?: boolean;
  dateFrom?: number;
  dateTo?: number;
  onFilterChange: (updates: Record<string, string | undefined>) => void;
};

function toDateInputValue(ms: number | undefined): string {
  if (!ms) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).formatToParts(new Date(ms));
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

export function VisitFilters({
  status,
  societyId,
  guardId,
  needsReassignment,
  dateFrom,
  dateTo,
  onFilterChange,
}: VisitFiltersProps) {
  const societies = useQuery(api.societies.list, {});
  const guards = useQuery(api.guards.list, {});

  const handleStatusChange = useCallback(
    (value: string) => {
      onFilterChange({ status: value || undefined });
    },
    [onFilterChange],
  );

  const handleSocietyChange = useCallback(
    (value: string) => {
      onFilterChange({ society_id: value || undefined });
    },
    [onFilterChange],
  );

  const handleGuardChange = useCallback(
    (value: string) => {
      onFilterChange({ guard_id: value || undefined });
    },
    [onFilterChange],
  );

  const handleReassignmentToggle = useCallback(() => {
    if (needsReassignment === true) {
      onFilterChange({ needs_reassignment: undefined });
    } else {
      onFilterChange({ needs_reassignment: "true" });
    }
  }, [needsReassignment, onFilterChange]);

  const handleDateFromChange = useCallback(
    (value: string) => {
      if (!value) {
        onFilterChange({ date_from: undefined });
        return;
      }
      const ms = new Date(`${value}T00:00:00+05:30`).getTime();
      onFilterChange({ date_from: String(ms) });
    },
    [onFilterChange],
  );

  const handleDateToChange = useCallback(
    (value: string) => {
      if (!value) {
        onFilterChange({ date_to: undefined });
        return;
      }
      const ms = new Date(`${value}T23:59:59.999+05:30`).getTime();
      onFilterChange({ date_to: String(ms) });
    },
    [onFilterChange],
  );

  const selectClasses =
    "flex h-9 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={status ?? "__all__"}
        onValueChange={(v) => handleStatusChange(v === "__all__" ? "" : v)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value || "__all__"}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={societyId ?? "__all__"}
        onValueChange={(v) => handleSocietyChange(v === "__all__" ? "" : v)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All Societies" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Societies</SelectItem>
          {societies?.map((s) => (
            <SelectItem key={s._id} value={s._id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={guardId ?? "__all__"}
        onValueChange={(v) => handleGuardChange(v === "__all__" ? "" : v)}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All Guards" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Guards</SelectItem>
          {guards?.map((g) => (
            <SelectItem key={g.user_id} value={g.user_id}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DatePicker
        value={toDateInputValue(dateFrom)}
        onChange={handleDateFromChange}
        placeholder="From"
        className={cn(selectClasses, "w-[140px]")}
      />

      <DatePicker
        value={toDateInputValue(dateTo)}
        onChange={handleDateToChange}
        placeholder="To"
        className={cn(selectClasses, "w-[140px]")}
      />

      <button
        type="button"
        onClick={handleReassignmentToggle}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors",
          needsReassignment === true
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        )}
      >
        Needs Reassignment
      </button>
    </div>
  );
}
