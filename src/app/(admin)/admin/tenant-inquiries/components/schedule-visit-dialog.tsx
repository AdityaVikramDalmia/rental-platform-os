"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const scheduleVisitSchema = z
  .object({
    date: z.string().min(1, "Visit date is required"),
    start_time: z.string().min(1, "Start time is required"),
    end_time: z.string().min(1, "End time is required"),
    ops_notes: z.string().optional(),
  })
  .refine((data) => data.date >= getTodayDateString(), {
    message: "Visit date must be today or later",
    path: ["date"],
  })
  .refine(
    (data) => {
      if (!data.date || !data.start_time || !data.end_time) return true;
      const start = new Date(`${data.date}T${data.start_time}:00`).getTime();
      const end = new Date(`${data.date}T${data.end_time}:00`).getTime();
      return start < end;
    },
    {
      message: "End time must be after start time",
      path: ["end_time"],
    },
  );

type ScheduleVisitValues = z.infer<typeof scheduleVisitSchema>;

type ScheduleVisitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiryId: Id<"tenant_inquiries">;
  guardName?: string;
};

export function ScheduleVisitDialog({
  open,
  onOpenChange,
  inquiryId,
  guardName,
}: ScheduleVisitDialogProps) {
  const scheduleVisit = useMutation(api.tenantInquiries.scheduleVisit);

  const form = useForm<ScheduleVisitValues>({
    resolver: zodResolver(scheduleVisitSchema),
    defaultValues: {
      date: getTodayDateString(),
      start_time: "10:00",
      end_time: "10:30",
      ops_notes: "",
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset({
        date: getTodayDateString(),
        start_time: "10:00",
        end_time: "10:30",
        ops_notes: "",
      });
    }
  }, [form, open]);

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: ScheduleVisitValues) {
    const scheduledStart = new Date(`${values.date}T${values.start_time}:00`).getTime();
    const scheduledEnd = new Date(`${values.date}T${values.end_time}:00`).getTime();

    try {
      await scheduleVisit({
        id: inquiryId,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
      });
      toast.success("Visit scheduled");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to schedule visit");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule Visit</DialogTitle>
          <DialogDescription>
            Set the visit date/time for this inquiry and notify the assigned guard.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visit Date</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        minDate={getTodayDateString()}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start</FormLabel>
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
                    <FormLabel>End</FormLabel>
                    <FormControl>
                      <TimePicker value={field.value} onChange={field.onChange} stepMinutes={30} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormItem>
              <FormLabel>Assigned Guard</FormLabel>
              <FormControl>
                <Input value={guardName ?? "Unassigned"} readOnly disabled />
              </FormControl>
            </FormItem>

            <FormField
              control={form.control}
              name="ops_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={3}
                      placeholder="Add context for internal ops follow-up"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-cyan-700 hover:bg-cyan-800"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  "Schedule Visit"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
