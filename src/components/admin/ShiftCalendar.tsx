"use client";

import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SHIFT_TYPE } from "../../../lib/constants";
import { ShiftCreateDialog } from "@/components/admin/ShiftCreateDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type ShiftEditData = {
  _id: Id<"guard_shifts">;
  shift_type: string;
  day_of_week?: number;
  specific_date?: number;
  start_time: string;
  end_time: string;
  location_type: string;
  building_id?: Id<"buildings">;
  location_label?: string;
  notes?: string;
};

function getMondayOfWeek(weekOffset: number): number {
  const now = Date.now();
  const istNow = now + IST_OFFSET_MS;
  const istDayStart = Math.floor(istNow / DAY_MS) * DAY_MS;
  const todayUtc = istDayStart - IST_OFFSET_MS;

  const jsDay = new Date(todayUtc).getUTCDay();
  const daysFromMonday = jsDay === 0 ? 6 : jsDay - 1;
  const mondayMs = todayUtc - daysFromMonday * DAY_MS;

  return mondayMs + weekOffset * 7 * DAY_MS;
}

function formatDateShort(ms: number): string {
  const d = new Date(ms + IST_OFFSET_MS);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

function formatWeekLabel(mondayMs: number): string {
  const d = new Date(mondayMs + IST_OFFSET_MS);
  const day = d.getUTCDate();
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `Week of ${day} ${month} ${year}`;
}

function isCurrentDay(dateMs: number): boolean {
  const now = Date.now();
  const istNow = now + IST_OFFSET_MS;
  const istDate = dateMs + IST_OFFSET_MS;
  const nowDay = Math.floor(istNow / DAY_MS);
  const dateDay = Math.floor(istDate / DAY_MS);
  return nowDay === dateDay;
}

type ShiftCalendarProps = {
  guardUserId: Id<"users">;
  guardSocietyId: Id<"societies">;
};

export function ShiftCalendar({ guardUserId, guardSocietyId }: ShiftCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<ShiftEditData | undefined>(undefined);

  const mondayMs = useMemo(() => getMondayOfWeek(weekOffset), [weekOffset]);
  const sundayMs = mondayMs + 6 * DAY_MS;

  const schedule = useQuery(api.guardShifts.getSchedule, {
    guard_user_id: guardUserId,
    from_date: mondayMs,
    to_date: sundayMs,
  });

  function openCreateDialog() {
    setSelectedShift(undefined);
    setIsDialogOpen(true);
  }

  function openEditDialog(shift: ShiftEditData) {
    setSelectedShift(shift);
    setIsDialogOpen(true);
  }

  const isLoading = schedule === undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous week"
            className="size-8"
            onClick={() => setWeekOffset((prev) => prev - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[180px] text-center text-sm font-medium text-slate-700">
            {formatWeekLabel(mondayMs)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next week"
            className="size-8"
            onClick={() => setWeekOffset((prev) => prev + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
          {weekOffset !== 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-1 h-7 text-xs text-slate-500"
              onClick={() => setWeekOffset(0)}
            >
              Today
            </Button>
          ) : null}
        </div>

        <Button
          type="button"
          size="sm"
          className="h-8 bg-slate-900 text-white hover:bg-slate-800"
          onClick={openCreateDialog}
        >
          <Plus className="size-3.5" />
          Add Shift
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={`skel-${DAY_NAMES[i]}`} className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {schedule.map((day, dayIdx) => {
            const isToday = weekOffset === 0 && isCurrentDay(day.date);
            return (
              <div key={day.date} className="min-h-[100px]">
                <div
                  className={`mb-1.5 rounded-md px-2 py-1.5 text-center ${
                    isToday ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <div className="text-xs font-medium">{DAY_NAMES[dayIdx]}</div>
                  <div className={`text-xs ${isToday ? "text-slate-300" : "text-slate-400"}`}>
                    {formatDateShort(day.date)}
                  </div>
                </div>

                {day.shifts.length === 0 ? (
                  <p className="px-1 py-3 text-center text-xs text-slate-400">No shifts</p>
                ) : (
                  <div className="space-y-1.5">
                    {day.shifts.map((shift) => {
                      const isOverride = shift.shift_type === SHIFT_TYPE.OVERRIDE;
                      return (
                        <button
                          key={shift._id}
                          type="button"
                          onClick={() =>
                            openEditDialog({
                              _id: shift._id,
                              shift_type: shift.shift_type,
                              day_of_week: shift.day_of_week,
                              specific_date: shift.specific_date,
                              start_time: shift.start_time,
                              end_time: shift.end_time,
                              location_type: shift.location_type,
                              building_id: shift.building_id ?? undefined,
                              location_label: shift.location_label ?? undefined,
                              notes: shift.notes ?? undefined,
                            })
                          }
                          className={`w-full cursor-pointer rounded-md border-l-2 px-2 py-1.5 text-left transition-shadow hover:shadow-sm ${
                            isOverride
                              ? "border-l-amber-400 bg-amber-50 hover:bg-amber-100"
                              : "border-l-indigo-400 bg-indigo-50 hover:bg-indigo-100"
                          }`}
                        >
                          {isOverride ? (
                            <Badge className="mb-0.5 h-4 border-amber-200 bg-amber-100 px-1 text-[10px] text-amber-700">
                              Override
                            </Badge>
                          ) : null}
                          <div
                            className={`text-xs font-medium ${isOverride ? "text-amber-900" : "text-indigo-900"}`}
                          >
                            {shift.start_time}–{shift.end_time}
                          </div>
                          <div
                            className={`truncate text-[11px] ${isOverride ? "text-amber-700" : "text-indigo-700"}`}
                          >
                            {shift.location_display}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ShiftCreateDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        guardUserId={guardUserId}
        guardSocietyId={guardSocietyId}
        shift={selectedShift}
      />
    </div>
  );
}
