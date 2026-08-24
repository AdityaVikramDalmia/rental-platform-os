"use client";

import { useQuery } from "convex/react";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  users: "Users",
  guard_profiles: "Guard Profiles",
  guard_shifts: "Guard Shifts",
  leads: "Leads",
  owner_verifications: "Owner Verifications",
  listings: "Listings",
  visits: "Visits",
  closures: "Closures",
  payouts: "Payouts",
  incentive_cards: "Incentive Cards",
  roles: "Roles",
  user_role_assignments: "Role Assignments",
  system_config: "System Config",
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

type AuditFilterBarProps = {
  actor: string | undefined;
  action: string | undefined;
  entityType: string | undefined;
  entityId: string | undefined;
  dateFrom: number | undefined;
  dateTo: number | undefined;
  onFilterChange: (updates: Record<string, string | undefined>) => void;
};

export function AuditFilterBar({
  actor,
  action,
  entityType,
  entityId,
  dateFrom,
  dateTo,
  onFilterChange,
}: AuditFilterBarProps) {
  const filterOptions = useQuery(api.auditLogs.getFilterOptions);
  const [localEntityId, setLocalEntityId] = useState(entityId ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleEntityIdChange = useCallback(
    (value: string) => {
      setLocalEntityId(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFilterChange({ entity_id: value || undefined });
      }, 300);
    },
    [onFilterChange],
  );

  const handleActorChange = useCallback(
    (value: string) => {
      onFilterChange({ actor: value === "__all__" ? undefined : value });
    },
    [onFilterChange],
  );

  const handleActionChange = useCallback(
    (value: string) => {
      onFilterChange({ action: value === "__all__" ? undefined : value });
    },
    [onFilterChange],
  );

  const handleEntityTypeChange = useCallback(
    (value: string) => {
      onFilterChange({
        entity_type: value === "__all__" ? undefined : value,
        entity_id: undefined,
      });
      setLocalEntityId("");
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

  const clearAll = useCallback(() => {
    onFilterChange({
      actor: undefined,
      action: undefined,
      entity_type: undefined,
      entity_id: undefined,
      date_from: undefined,
      date_to: undefined,
    });
    setLocalEntityId("");
  }, [onFilterChange]);

  const hasFilters = actor || action || entityType || entityId || dateFrom || dateTo;

  const selectTriggerClasses =
    "flex h-9 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2";

  return (
    <div className="flex flex-wrap items-start gap-3">
      <Select value={actor ?? "__all__"} onValueChange={handleActorChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All Actors" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Actors</SelectItem>
          {filterOptions?.recent_actors.map((a) => (
            <SelectItem key={a.user_id ?? "__system__"} value={a.user_id ?? "__system__"}>
              {a.name} ({a.actor_type})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={action ?? "__all__"} onValueChange={handleActionChange}>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="All Actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Actions</SelectItem>
          {filterOptions?.actions.map((group) => (
            <SelectGroup key={group.group}>
              <SelectLabel>{group.group}</SelectLabel>
              {group.items.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      <Select value={entityType ?? "__all__"} onValueChange={handleEntityTypeChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All Entity Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Entity Types</SelectItem>
          {filterOptions?.entity_types.map((et) => (
            <SelectItem key={et} value={et}>
              {ENTITY_TYPE_LABELS[et] ?? et}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={localEntityId}
        onChange={(e) => handleEntityIdChange(e.target.value)}
        placeholder="Entity ID..."
        disabled={!entityType}
        className={cn("h-9 w-[180px]", !entityType && "opacity-50")}
      />

      <DatePicker
        value={toDateInputValue(dateFrom)}
        onChange={handleDateFromChange}
        placeholder="From"
        className={cn(selectTriggerClasses, "w-[140px]")}
      />

      <DatePicker
        value={toDateInputValue(dateTo)}
        onChange={handleDateToChange}
        placeholder="To"
        className={cn(selectTriggerClasses, "w-[140px]")}
      />

      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          onClick={clearAll}
          className="ml-auto h-9 gap-1.5 text-slate-500 hover:text-slate-700"
        >
          <X className="size-3.5" />
          Clear Filters
        </Button>
      )}
    </div>
  );
}
