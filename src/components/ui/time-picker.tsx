"use client";

import * as React from "react";
import { ClockIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TimePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  stepMinutes?: 15 | 30 | 60;
  minTime?: string;
  maxTime?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function generateTimeSlots(step: number, minTime?: string, maxTime?: string): string[] {
  const slots: string[] = [];
  const minMinutes = minTime ? parseHHMM(minTime) : 0;
  const maxMinutes = maxTime ? parseHHMM(maxTime) : 24 * 60 - 1;

  for (let m = 0; m < 24 * 60; m += step) {
    if (m >= minMinutes && m <= maxMinutes) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}

function parseHHMM(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined) return time;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function TimePicker({
  value,
  onChange,
  stepMinutes = 30,
  minTime,
  maxTime,
  placeholder = "Pick time",
  disabled = false,
  className,
}: TimePickerProps) {
  const slots = React.useMemo(
    () => generateTimeSlots(stepMinutes, minTime, maxTime),
    [stepMinutes, minTime, maxTime],
  );

  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("w-full", className)}>
        <div className="flex items-center gap-2">
          <ClockIcon className="size-4 text-muted-foreground" />
          <SelectValue placeholder={placeholder} />
        </div>
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-60">
        {slots.map((slot) => (
          <SelectItem key={slot} value={slot}>
            {formatTimeDisplay(slot)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { TimePicker };
export type { TimePickerProps };
