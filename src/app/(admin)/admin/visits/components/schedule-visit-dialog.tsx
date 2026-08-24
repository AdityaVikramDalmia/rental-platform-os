"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  CHECKLIST_DEPTH,
  CHECKLIST_DEPTH_LABELS,
  LEAD_STATUS,
  type VisitStatus,
} from "../../../../../../lib/constants";
import { VisitStatusBadge } from "@/components/shared/visit-status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GuardAvailabilityGrid } from "./guard-availability-grid";

const checklistDepthValues = [
  CHECKLIST_DEPTH.LIGHT,
  CHECKLIST_DEPTH.MEDIUM,
  CHECKLIST_DEPTH.FULL,
] as const;

const scheduleVisitSchema = z
  .object({
    lead_id: z.string().min(1, "Select a verified lead"),
    date: z.string().min(1, "Date is required"),
    time_start: z.string().min(1, "Start time is required"),
    time_end: z.string().min(1, "End time is required"),
    guard_id: z.string().min(1, "Select a guard"),
    attach_checklist: z.boolean(),
    checklist_template_id: z.string().optional(),
    checklist_depth: z.enum(checklistDepthValues).optional(),
  })
  .refine(
    (data) => {
      if (!data.date || !data.time_start || !data.time_end) return true;
      const start = new Date(`${data.date}T${data.time_start}`).getTime();
      const end = new Date(`${data.date}T${data.time_end}`).getTime();
      return start < end;
    },
    { message: "End time must be after start time", path: ["time_end"] },
  )
  .refine(
    (data) => {
      if (!data.date || !data.time_start) return true;
      const start = new Date(`${data.date}T${data.time_start}`).getTime();
      return start > Date.now();
    },
    { message: "Start time must be in the future", path: ["time_start"] },
  )
  .refine(
    (data) => {
      if (!data.attach_checklist) {
        return true;
      }

      return Boolean(data.checklist_template_id && data.checklist_depth);
    },
    {
      message: "Select checklist template and depth",
      path: ["checklist_template_id"],
    },
  );

type ScheduleVisitFormValues = z.infer<typeof scheduleVisitSchema>;

type ScheduleVisitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const skipToken = "skip" as const;

function formatConflictTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function ScheduleVisitDialog({ open, onOpenChange }: ScheduleVisitDialogProps) {
  const createVisit = useMutation(api.visits.create);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedGuardName, setSelectedGuardName] = useState("");

  const verifiedLeads = useQuery(
    api.leads.list,
    open
      ? {
          paginationOpts: { numItems: 100, cursor: null },
          status: LEAD_STATUS.VERIFIED,
        }
      : "skip",
  );

  const activeChecklistTemplates = useQuery(api.checklistTemplates.listActive, open ? {} : "skip");

  const form = useForm<ScheduleVisitFormValues>({
    resolver: zodResolver(scheduleVisitSchema),
    defaultValues: {
      lead_id: "",
      date: "",
      time_start: "",
      time_end: "",
      guard_id: "",
      attach_checklist: false,
      checklist_template_id: undefined,
      checklist_depth: undefined,
    },
  });

  const watchedLeadId = form.watch("lead_id");
  const watchedDate = form.watch("date");
  const watchedTimeStart = form.watch("time_start");
  const watchedTimeEnd = form.watch("time_end");
  const watchedGuardId = form.watch("guard_id");
  const watchedAttachChecklist = form.watch("attach_checklist");

  const selectedLead = useMemo(() => {
    if (!verifiedLeads?.page || !watchedLeadId) return null;
    return verifiedLeads.page.find((l) => l._id === watchedLeadId) ?? null;
  }, [verifiedLeads, watchedLeadId]);

  const canShowGuardGrid =
    !!selectedLead && !!watchedDate && !!watchedTimeStart && !!watchedTimeEnd;

  const scheduledStartMs = useMemo(() => {
    if (!watchedDate || !watchedTimeStart) return 0;
    return new Date(`${watchedDate}T${watchedTimeStart}`).getTime();
  }, [watchedDate, watchedTimeStart]);

  const scheduledEndMs = useMemo(() => {
    if (!watchedDate || !watchedTimeEnd) return 0;
    return new Date(`${watchedDate}T${watchedTimeEnd}`).getTime();
  }, [watchedDate, watchedTimeEnd]);

  const guardConflictData = useQuery(
    api.visits.checkGuardConflicts,
    open && watchedGuardId && scheduledStartMs
      ? {
          assigned_guard_id: watchedGuardId as Id<"users">,
          proposed_start_ms: scheduledStartMs,
        }
      : skipToken,
  );

  const conflicts = guardConflictData?.conflicts ?? [];
  const conflictGuardName = selectedGuardName || "Selected guard";

  useEffect(() => {
    if (!open) {
      form.reset();
      setSelectedGuardName("");
    }
  }, [open, form]);

  const handleGuardSelect = useCallback(
    (guardId: Id<"users">, guardName?: string) => {
      form.setValue("guard_id", guardId, { shouldValidate: true });
      setSelectedGuardName(guardName ?? "Selected guard");
    },
    [form],
  );

  async function onSubmit(values: ScheduleVisitFormValues) {
    setIsSubmitting(true);
    try {
      const startMs = new Date(`${values.date}T${values.time_start}`).getTime();
      const endMs = new Date(`${values.date}T${values.time_end}`).getTime();

      await createVisit({
        lead_id: values.lead_id as Id<"leads">,
        scheduled_start: startMs,
        scheduled_end: endMs,
        assigned_guard_id: values.guard_id as Id<"users">,
        checklist_template_id: values.attach_checklist
          ? (values.checklist_template_id as Id<"checklist_templates">)
          : undefined,
        checklist_depth: values.attach_checklist ? values.checklist_depth : undefined,
      });

      toast.success("Visit scheduled!");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to schedule visit");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule Visit</DialogTitle>
          <DialogDescription>
            Schedule a property visit for a verified lead with an available guard.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="lead_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Verified Lead *</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange({ target: { value: v } });
                        form.setValue("guard_id", "");
                        setSelectedGuardName("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a verified lead..." />
                      </SelectTrigger>
                      <SelectContent>
                        {verifiedLeads?.page.map((lead) => (
                          <SelectItem key={lead._id} value={lead._id}>
                            {lead.building_name ?? "—"} / Fl{lead.floor_number} / {lead.flat_number}{" "}
                            — {lead.society_name ?? "—"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedLead && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <span className="font-medium text-slate-800">{selectedLead.society_name}</span>{" "}
                &mdash; {selectedLead.building_name} / Fl{selectedLead.floor_number} /{" "}
                {selectedLead.flat_number}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          form.setValue("guard_id", "");
                          setSelectedGuardName("");
                        }}
                        minDate={new Date().toISOString().split("T")[0]}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time_start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start *</FormLabel>
                    <FormControl>
                      <TimePicker
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          form.setValue("guard_id", "");
                          setSelectedGuardName("");
                        }}
                        stepMinutes={30}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time_end"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End *</FormLabel>
                    <FormControl>
                      <TimePicker
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          form.setValue("guard_id", "");
                          setSelectedGuardName("");
                        }}
                        stepMinutes={30}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="guard_id"
              render={() => (
                <FormItem>
                  <FormLabel>Assign Guard *</FormLabel>
                  {canShowGuardGrid && selectedLead ? (
                    <GuardAvailabilityGrid
                      society_id={selectedLead.society_id as Id<"societies">}
                      building_id={selectedLead.building_id as Id<"buildings">}
                      date={scheduledStartMs}
                      time_start={scheduledStartMs}
                      time_end={scheduledEndMs}
                      value={watchedGuardId ? (watchedGuardId as Id<"users">) : undefined}
                      onChange={handleGuardSelect}
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 py-4 text-center text-sm text-slate-400">
                      Select a lead, date, and time range to see available guards
                    </div>
                  )}

                  {conflicts.length > 0 ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                      <div className="mb-2 flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 size-4 text-amber-600" />
                        <p className="font-semibold">
                          ⚠️ {conflictGuardName} has {conflicts.length} other visit
                          {conflicts.length > 1 ? "s" : ""} within 2 hours
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        {conflicts.map((conflict) => (
                          <div
                            key={conflict.visit_id}
                            className="flex flex-col gap-1 rounded bg-amber-100/60 px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <p className="text-xs text-amber-900">
                              {formatConflictTime(conflict.scheduled_start_ms)} ·
                              {` ${conflict.society_name} · ${conflict.flat_number}`}
                            </p>
                            <VisitStatusBadge status={conflict.status as VisitStatus} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <FormField
                control={form.control}
                name="attach_checklist"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel className="text-sm font-semibold text-slate-800">
                        Attach Property Inspection Checklist
                      </FormLabel>
                      <p className="text-xs text-slate-500">
                        Optional: require checklist submission before visit completion
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          if (!checked) {
                            form.setValue("checklist_template_id", undefined, {
                              shouldValidate: true,
                            });
                            form.setValue("checklist_depth", undefined, {
                              shouldValidate: true,
                            });
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {watchedAttachChecklist && (
                <>
                  <FormField
                    control={form.control}
                    name="checklist_template_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Checklist Template *</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={(value) => field.onChange(value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a checklist template..." />
                            </SelectTrigger>
                            <SelectContent>
                              {activeChecklistTemplates?.map((template) => (
                                <SelectItem key={template._id} value={template._id}>
                                  {template.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="checklist_depth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Checklist Depth *</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={(value) => field.onChange(value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select depth..." />
                            </SelectTrigger>
                            <SelectContent>
                              {checklistDepthValues.map((depth) => (
                                <SelectItem key={depth} value={depth}>
                                  {CHECKLIST_DEPTH_LABELS[depth]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
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
                    Scheduling...
                  </>
                ) : (
                  "Schedule Visit"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
