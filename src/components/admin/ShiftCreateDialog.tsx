"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LOCATION_TYPE, SHIFT_TYPE } from "../../../lib/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";

const LOCATION_TYPE_LABELS: Record<string, string> = {
  [LOCATION_TYPE.BUILDING]: "Building",
  [LOCATION_TYPE.MAIN_GATE]: "Main Gate",
  [LOCATION_TYPE.PARK]: "Park",
  [LOCATION_TYPE.PARKING]: "Parking",
  [LOCATION_TYPE.OTHER]: "Other",
};

const DAY_LABELS: { value: number; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const IST_OFFSET_MS = 330 * 60 * 1000;

function dateToISTString(ms: number): string {
  const istDate = new Date(ms + IST_OFFSET_MS);
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function istStringToStartOfDayMs(dateStr: string): number {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);
  const utcMs = Date.UTC(year, month, day);
  return utcMs - IST_OFFSET_MS;
}

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const shiftFormSchema = z
  .object({
    shift_type: z.enum([SHIFT_TYPE.RECURRING, SHIFT_TYPE.OVERRIDE]),
    day_of_week: z.string().optional(),
    specific_date: z.string().optional(),
    start_time: z.string().regex(TIME_REGEX, "Use HH:MM format"),
    end_time: z.string().regex(TIME_REGEX, "Use HH:MM format"),
    location_type: z.enum([
      LOCATION_TYPE.BUILDING,
      LOCATION_TYPE.MAIN_GATE,
      LOCATION_TYPE.PARK,
      LOCATION_TYPE.PARKING,
      LOCATION_TYPE.OTHER,
    ]),
    building_id: z.string().optional(),
    location_label: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (
      values.shift_type === SHIFT_TYPE.RECURRING &&
      !values.day_of_week &&
      values.day_of_week !== "0"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["day_of_week"],
        message: "Day of week is required",
      });
    }

    if (values.shift_type === SHIFT_TYPE.OVERRIDE && !values.specific_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specific_date"],
        message: "Date is required",
      });
    }
  });

type ShiftFormValues = z.infer<typeof shiftFormSchema>;

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

type ShiftCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guardUserId: Id<"users">;
  guardSocietyId: Id<"societies">;
  shift?: ShiftEditData;
};

export function ShiftCreateDialog({
  open,
  onOpenChange,
  guardUserId,
  guardSocietyId,
  shift,
}: ShiftCreateDialogProps) {
  const createShift = useMutation(api.guardShifts.create);
  const updateShift = useMutation(api.guardShifts.update);
  const deleteShift = useMutation(api.guardShifts.softDelete);
  const buildings = useQuery(api.buildings.listBySociety, { society_id: guardSocietyId });

  const isEdit = shift !== undefined;

  const defaultValues = useMemo((): ShiftFormValues => {
    if (shift) {
      return {
        shift_type: shift.shift_type as ShiftFormValues["shift_type"],
        day_of_week: shift.day_of_week !== undefined ? String(shift.day_of_week) : undefined,
        specific_date: shift.specific_date ? dateToISTString(shift.specific_date) : undefined,
        start_time: shift.start_time,
        end_time: shift.end_time,
        location_type: shift.location_type as ShiftFormValues["location_type"],
        building_id: shift.building_id ?? undefined,
        location_label: shift.location_label ?? undefined,
        notes: shift.notes ?? undefined,
      };
    }

    return {
      shift_type: SHIFT_TYPE.RECURRING,
      day_of_week: "1",
      specific_date: undefined,
      start_time: "09:00",
      end_time: "18:00",
      location_type: LOCATION_TYPE.MAIN_GATE,
      building_id: undefined,
      location_label: undefined,
      notes: undefined,
    };
  }, [shift]);

  const form = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftFormSchema),
    defaultValues,
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    form.reset(defaultValues);
  }, [form, open, defaultValues]);

  const handleDialogClose = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        form.reset();
      }
    },
    [onOpenChange, form],
  );

  const watchedShiftType = form.watch("shift_type");
  const watchedLocationType = form.watch("location_type");

  async function onSubmit(values: ShiftFormValues) {
    if (
      values.shift_type === SHIFT_TYPE.RECURRING &&
      !values.day_of_week &&
      values.day_of_week !== "0"
    ) {
      form.setError("day_of_week", { message: "Day of week is required" });
      return;
    }

    if (values.shift_type === SHIFT_TYPE.OVERRIDE && !values.specific_date) {
      form.setError("specific_date", { message: "Date is required" });
      return;
    }

    if (
      values.location_type === LOCATION_TYPE.BUILDING &&
      (!values.building_id || values.building_id === "")
    ) {
      form.setError("building_id", { message: "Building is required" });
      return;
    }

    try {
      if (isEdit && shift) {
        const updateArgs: {
          shift_id: Id<"guard_shifts">;
          day_of_week?: number;
          specific_date?: number;
          start_time?: string;
          end_time?: string;
          location_type?: string;
          building_id?: Id<"buildings">;
          location_label?: string;
          notes?: string;
        } = { shift_id: shift._id };

        if (shift.shift_type === SHIFT_TYPE.RECURRING && values.day_of_week !== undefined) {
          const dayNum = Number(values.day_of_week);
          if (dayNum !== shift.day_of_week) {
            updateArgs.day_of_week = dayNum;
          }
        }

        if (shift.shift_type === SHIFT_TYPE.OVERRIDE && values.specific_date) {
          const newDateMs = istStringToStartOfDayMs(values.specific_date);
          if (newDateMs !== shift.specific_date) {
            updateArgs.specific_date = newDateMs;
          }
        }

        if (values.start_time !== shift.start_time) {
          updateArgs.start_time = values.start_time;
        }

        if (values.end_time !== shift.end_time) {
          updateArgs.end_time = values.end_time;
        }

        if (values.location_type !== shift.location_type) {
          updateArgs.location_type = values.location_type;
        }

        if (
          values.location_type === LOCATION_TYPE.BUILDING &&
          values.building_id &&
          values.building_id !== shift.building_id
        ) {
          updateArgs.building_id = values.building_id as Id<"buildings">;
        }

        if (values.location_label !== (shift.location_label ?? undefined)) {
          updateArgs.location_label = values.location_label ?? "";
        }

        if (values.notes !== (shift.notes ?? undefined)) {
          updateArgs.notes = values.notes ?? "";
        }

        await updateShift(updateArgs);
        toast.success("Shift updated");
      } else {
        const createArgs: {
          guard_user_id: Id<"users">;
          shift_type: string;
          day_of_week?: number;
          specific_date?: number;
          start_time: string;
          end_time: string;
          location_type: string;
          building_id?: Id<"buildings">;
          location_label?: string;
          notes?: string;
        } = {
          guard_user_id: guardUserId,
          shift_type: values.shift_type,
          start_time: values.start_time,
          end_time: values.end_time,
          location_type: values.location_type,
        };

        if (values.shift_type === SHIFT_TYPE.RECURRING && values.day_of_week !== undefined) {
          createArgs.day_of_week = Number(values.day_of_week);
        } else if (values.specific_date) {
          createArgs.specific_date = istStringToStartOfDayMs(values.specific_date);
        }

        if (values.location_type === LOCATION_TYPE.BUILDING && values.building_id) {
          createArgs.building_id = values.building_id as Id<"buildings">;
        }

        if (values.location_label) {
          createArgs.location_label = values.location_label;
        }

        if (values.notes) {
          createArgs.notes = values.notes;
        }

        await createShift(createArgs);
        toast.success("Shift created");
      }

      handleDialogClose(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save shift";
      toast.error(message);
    }
  }

  async function handleDelete() {
    if (!shift) return;

    const confirmed = window.confirm("Delete this shift? This cannot be undone.");
    if (!confirmed) return;

    try {
      await deleteShift({ shift_id: shift._id });
      toast.success("Shift deleted");
      handleDialogClose(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete shift";
      toast.error(message);
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Shift" : "Add Shift"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update shift schedule details." : "Create a new shift for this guard."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="shift_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shift Type</FormLabel>
                  <FormControl>
                    <div className="flex gap-3">
                      <label
                        className={`flex flex-1 cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm transition-colors ${
                          field.value === SHIFT_TYPE.RECURRING
                            ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        } ${isEdit ? "pointer-events-none opacity-60" : ""}`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          checked={field.value === SHIFT_TYPE.RECURRING}
                          onChange={() => {
                            if (!isEdit) field.onChange(SHIFT_TYPE.RECURRING);
                          }}
                          disabled={isEdit}
                        />
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                            field.value === SHIFT_TYPE.RECURRING
                              ? "border-indigo-500"
                              : "border-slate-300"
                          }`}
                        >
                          {field.value === SHIFT_TYPE.RECURRING ? (
                            <span className="size-2 rounded-full bg-indigo-500" />
                          ) : null}
                        </span>
                        <span className="font-medium">Recurring</span>
                      </label>

                      <label
                        className={`flex flex-1 cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm transition-colors ${
                          field.value === SHIFT_TYPE.OVERRIDE
                            ? "border-amber-300 bg-amber-50 text-amber-900"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        } ${isEdit ? "pointer-events-none opacity-60" : ""}`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          checked={field.value === SHIFT_TYPE.OVERRIDE}
                          onChange={() => {
                            if (!isEdit) field.onChange(SHIFT_TYPE.OVERRIDE);
                          }}
                          disabled={isEdit}
                        />
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                            field.value === SHIFT_TYPE.OVERRIDE
                              ? "border-amber-500"
                              : "border-slate-300"
                          }`}
                        >
                          {field.value === SHIFT_TYPE.OVERRIDE ? (
                            <span className="size-2 rounded-full bg-amber-500" />
                          ) : null}
                        </span>
                        <span className="font-medium">One-time</span>
                      </label>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchedShiftType === SHIFT_TYPE.RECURRING ? (
              <FormField
                control={form.control}
                name="day_of_week"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Day of Week</FormLabel>
                    <FormControl>
                      <select
                        value={field.value ?? ""}
                        onChange={(event) => field.onChange(String(event.target.value))}
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                      >
                        {DAY_LABELS.map((d) => (
                          <option key={d.value} value={String(d.value)}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {watchedShiftType === SHIFT_TYPE.OVERRIDE ? (
              <FormField
                control={form.control}
                name="specific_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <DatePicker value={field.value ?? ""} onChange={(v) => field.onChange(v)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <TimePicker value={field.value} onChange={field.onChange} stepMinutes={30} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <TimePicker value={field.value} onChange={field.onChange} stepMinutes={30} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <select
                      value={field.value}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                        if (event.target.value !== LOCATION_TYPE.BUILDING) {
                          form.setValue("building_id", undefined);
                        }
                      }}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      {Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchedLocationType === LOCATION_TYPE.BUILDING ? (
              <FormField
                control={form.control}
                name="building_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Building</FormLabel>
                    <FormControl>
                      <select
                        value={field.value ?? ""}
                        onChange={(event) => field.onChange(event.target.value)}
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                      >
                        <option value="">Select a building</option>
                        {(buildings ?? []).map((b) => (
                          <option key={b._id} value={b._id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {watchedLocationType !== LOCATION_TYPE.BUILDING &&
            watchedLocationType !== LOCATION_TYPE.MAIN_GATE ? (
              <FormField
                control={form.control}
                name="location_label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Location Label <span className="font-normal text-slate-400">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="e.g. North Park, Basement B2"
                        className="h-10 border-slate-300"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Notes <span className="font-normal text-slate-400">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Special instructions"
                      className="h-10 border-slate-300"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="flex-row gap-2 sm:justify-between">
              {isEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={handleDelete}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              ) : (
                <div />
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {isEdit ? "Saving..." : "Creating..."}
                    </>
                  ) : isEdit ? (
                    "Update Shift"
                  ) : (
                    "Add Shift"
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
