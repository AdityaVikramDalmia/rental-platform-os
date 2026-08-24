"use client";

import type { FunctionReturnType } from "convex/server";
import { CalendarOff, Clock, MapPin } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import type { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Schedule = FunctionReturnType<typeof api.guardShifts.getMySchedule>;
type ScheduleDay = Schedule[number];
type Shift = ScheduleDay["shifts"][number];

const IST_TZ = "Asia/Kolkata";

function getDayLabel(
  index: number,
  dateMs: number,
  todayMs: number,
  format: ReturnType<typeof useFormatter>,
  todayLabel: string,
): string {
  const date = new Date(dateMs);
  const dayName = format.dateTime(date, { weekday: "long", timeZone: IST_TZ });
  const fullDate = `${dayName}, ${format.dateTime(date, "short")}`;

  if (index === 0) return `${todayLabel} (${fullDate})`;

  if (index === 1) {
    const relativeLabel = format.relativeTime(date, new Date(todayMs));
    const tomorrowLabel = relativeLabel.charAt(0).toUpperCase() + relativeLabel.slice(1);
    return `${tomorrowLabel} (${fullDate})`;
  }

  return fullDate;
}

function ShiftEntry({
  shift,
  isOverride,
  overrideLabel,
}: {
  shift: Shift;
  isOverride: boolean;
  overrideLabel: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border-l-[3px] bg-slate-50 px-3.5 py-3",
        isOverride ? "border-l-amber-400" : "border-l-indigo-400",
      )}
    >
      <div className="flex flex-1 items-center gap-2 text-base">
        <Clock className="size-4 shrink-0 text-slate-400" />
        <span className="font-medium tabular-nums text-slate-900">
          {shift.start_time} &ndash; {shift.end_time}
        </span>
        <span className="text-slate-300">|</span>
        <span className="flex items-center gap-1 truncate text-slate-600">
          <MapPin className="size-3.5 shrink-0" />
          {shift.location_display}
        </span>
      </div>
      {isOverride && (
        <Badge className="shrink-0 border-amber-200 bg-amber-50 text-[11px] font-medium text-amber-700 hover:bg-amber-50">
          {overrideLabel}
        </Badge>
      )}
    </div>
  );
}

function DaySection({
  day,
  index,
  todayMs,
  noShiftsLabel,
  todayLabel,
  overrideLabel,
}: {
  day: ScheduleDay;
  index: number;
  todayMs: number;
  noShiftsLabel: string;
  todayLabel: string;
  overrideLabel: string;
}) {
  const format = useFormatter();
  const label = getDayLabel(index, day.date, todayMs, format, todayLabel);
  const isOverride = day.source === "OVERRIDE";
  const isToday = index === 0;

  return (
    <div className="space-y-2">
      <h3
        className={cn("text-[15px] font-semibold", isToday ? "text-indigo-600" : "text-slate-800")}
      >
        {label}
      </h3>
      {day.shifts.length > 0 ? (
        <div className="space-y-2">
          {day.shifts.map((shift) => (
            <ShiftEntry
              key={shift._id}
              shift={shift}
              isOverride={isOverride}
              overrideLabel={overrideLabel}
            />
          ))}
        </div>
      ) : (
        <p className="py-2 text-sm text-slate-400">{noShiftsLabel}</p>
      )}
    </div>
  );
}

export function GuardShiftList({ schedule }: { schedule: Schedule }) {
  const tProfile = useTranslations("guard.profile");
  const tVisits = useTranslations("guard.visits");
  const tCommon = useTranslations("guard.common");
  const [nowFallback] = useState(() => Date.now());
  const allEmpty = schedule.every((day) => day.shifts.length === 0);

  if (allEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 rounded-full bg-slate-100 p-4">
          <CalendarOff className="size-8 text-slate-300" />
        </div>
        <p className="text-base font-medium text-slate-700">{tProfile("noShifts")}</p>
        <p className="mt-1 max-w-[280px] text-sm leading-relaxed text-slate-400">
          {tCommon("noData")}
        </p>
      </div>
    );
  }

  const todayMs = schedule[0]?.date ?? nowFallback;

  return (
    <div className="space-y-5">
      {schedule.map((day, index) => (
        <DaySection
          key={day.date}
          day={day}
          index={index}
          todayMs={todayMs}
          noShiftsLabel={tProfile("noShifts")}
          todayLabel={tVisits("today")}
          overrideLabel={tCommon("confirm")}
        />
      ))}
    </div>
  );
}
