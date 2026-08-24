"use client";

import { useQuery } from "convex/react";
import { Filter } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { PAYOUT_STATUS, type PayoutStatus } from "../../../../../../lib/constants";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS: { label: string; value: PayoutStatus }[] = [
  { label: "pending", value: PAYOUT_STATUS.PENDING },
  { label: "approved", value: PAYOUT_STATUS.APPROVED },
  { label: "disbursed", value: PAYOUT_STATUS.DISBURSED },
  { label: "failed", value: PAYOUT_STATUS.FAILED },
  { label: "voided", value: PAYOUT_STATUS.VOIDED },
];

type PayoutFiltersProps = {
  statuses: PayoutStatus[];
  guardUserId?: Id<"users">;
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

function sortStatuses(statuses: PayoutStatus[]): PayoutStatus[] {
  const order = Object.values(PAYOUT_STATUS);
  return [...statuses].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function PayoutFilters({
  statuses,
  guardUserId,
  dateFrom,
  dateTo,
  onFilterChange,
}: PayoutFiltersProps) {
  const guards = useQuery(api.guards.list, {});
  const [guardSearch, setGuardSearch] = useState("");

  const filteredGuards = useMemo(() => {
    if (!guards) {
      return [];
    }

    const normalized = guardSearch.trim().toLowerCase();
    if (!normalized) {
      return guards;
    }

    return guards.filter((guard) => {
      const haystack = `${guard.name} ${guard.phone ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [guardSearch, guards]);

  const selectedStatusSet = useMemo(() => new Set<PayoutStatus>(statuses), [statuses]);

  const handleStatusToggle = useCallback(
    (status: PayoutStatus, checked: boolean) => {
      const nextSet = new Set(selectedStatusSet);

      if (checked) {
        nextSet.add(status);
      } else {
        nextSet.delete(status);
      }

      const nextStatuses = sortStatuses(Array.from(nextSet));
      onFilterChange({ status: nextStatuses.length > 0 ? nextStatuses.join(",") : undefined });
    },
    [onFilterChange, selectedStatusSet],
  );

  const clearStatuses = useCallback(() => {
    onFilterChange({ status: undefined });
  }, [onFilterChange]);

  const handleGuardChange = useCallback(
    (value: string) => {
      onFilterChange({ guard_user_id: value || undefined });
    },
    [onFilterChange],
  );

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

  const statusSummary =
    statuses.length === 0
      ? "All"
      : statuses.length === 1
        ? statuses[0]
        : `${statuses.length} selected`;

  return (
    <div className="flex flex-wrap items-start gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-1.5 border-slate-300 text-slate-700"
          >
            <Filter className="size-4" />
            Status: {statusSummary}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selectedStatusSet.has(option.value)}
              onCheckedChange={(checked) => handleStatusToggle(option.value, Boolean(checked))}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <button
            type="button"
            onClick={clearStatuses}
            className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-100"
          >
            All
          </button>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={guardSearch}
          onChange={(event) => setGuardSearch(event.target.value)}
          className={cn(selectClasses, "w-[200px]")}
          placeholder="Search guard"
          title="Search guard"
        />
        <Select
          value={guardUserId ?? "__all__"}
          onValueChange={(v) => handleGuardChange(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="All Guards" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Guards</SelectItem>
            {filteredGuards.map((guard) => (
              <SelectItem key={guard.user_id} value={guard.user_id}>
                {guard.name} ({guard.phone ?? "—"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
    </div>
  );
}
