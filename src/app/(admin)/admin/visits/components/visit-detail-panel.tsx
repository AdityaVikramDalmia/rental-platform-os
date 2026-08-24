"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Building2, ClipboardList, Eye, FileText, Home, Loader2, Pencil } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { VISIT_STATUS, type VisitStatus } from "../../../../../../lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { GuardAvailabilityGrid } from "./guard-availability-grid";

const IST_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

function msToDateInput(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function msToTimeInput(ms: number): string {
  const d = new Date(ms);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

const editVisitSchema = z
  .object({
    date: z.string().min(1, "Date is required"),
    time_start: z.string().min(1, "Start time is required"),
    time_end: z.string().min(1, "End time is required"),
    guard_id: z.string().min(1, "Guard is required"),
  })
  .refine(
    (data) => {
      if (!data.date || !data.time_start || !data.time_end) return true;
      const start = new Date(`${data.date}T${data.time_start}`).getTime();
      const end = new Date(`${data.date}T${data.time_end}`).getTime();
      return start < end;
    },
    { message: "End time must be after start time", path: ["time_end"] },
  );

type EditVisitFormValues = z.infer<typeof editVisitSchema>;

type VisitData = {
  visit: {
    _id: Id<"visits">;
    lead_id: Id<"leads">;
    society_id: Id<"societies">;
    listing_id?: Id<"listings"> | null;
    scheduled_start: number;
    scheduled_end: number;
    assigned_guard_id: Id<"users">;
    status: string;
    outcome?: string | null;
    outcome_notes?: string | null;
    started_at?: number | null;
    completed_at?: number | null;
    needs_reassignment?: boolean;
  };
  lead: {
    _id: Id<"leads">;
    flat_number: string;
    floor_number: string;
    building_id: Id<"buildings">;
  } | null;
  building: { _id: Id<"buildings">; name: string } | null;
  society: { _id: Id<"societies">; name: string; city: string } | null;
  guard: {
    user_id: Id<"users">;
    name: string;
    phone?: string;
    status: string;
    guard_type?: string;
  } | null;
  listing: { _id: Id<"listings">; slug: string } | null;
};

type VisitDetailPanelProps = {
  data: VisitData;
  canEdit?: boolean;
};

const OUTCOME_LABELS: Record<string, string> = {
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not Interested",
  FOLLOWUP: "Follow-up",
};

const GUARD_TYPE_LABELS: Record<string, string> = {
  BUILDING_SPECIFIC: "Building",
  MAIN_GATE: "Main Gate",
  PARK: "Park",
  ROVING: "Roving",
};

export function VisitDetailPanel({ data, canEdit = true }: VisitDetailPanelProps) {
  const editVisit = useMutation(api.visits.edit);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isTerminal =
    data.visit.status === VISIT_STATUS.COMPLETED ||
    data.visit.status === VISIT_STATUS.CANCELLED ||
    data.visit.status === VISIT_STATUS.NO_SHOW;

  const form = useForm<EditVisitFormValues>({
    resolver: zodResolver(editVisitSchema),
    defaultValues: {
      date: msToDateInput(data.visit.scheduled_start),
      time_start: msToTimeInput(data.visit.scheduled_start),
      time_end: msToTimeInput(data.visit.scheduled_end),
      guard_id: data.visit.assigned_guard_id,
    },
  });

  useEffect(() => {
    form.reset({
      date: msToDateInput(data.visit.scheduled_start),
      time_start: msToTimeInput(data.visit.scheduled_start),
      time_end: msToTimeInput(data.visit.scheduled_end),
      guard_id: data.visit.assigned_guard_id,
    });
  }, [data.visit.scheduled_start, data.visit.scheduled_end, data.visit.assigned_guard_id, form]);

  const watchedDate = form.watch("date");
  const watchedTimeStart = form.watch("time_start");
  const watchedTimeEnd = form.watch("time_end");

  const scheduledStartMs =
    watchedDate && watchedTimeStart ? new Date(`${watchedDate}T${watchedTimeStart}`).getTime() : 0;

  const scheduledEndMs =
    watchedDate && watchedTimeEnd ? new Date(`${watchedDate}T${watchedTimeEnd}`).getTime() : 0;

  const handleGuardSelect = useCallback(
    (guardId: Id<"users">) => {
      form.setValue("guard_id", guardId, { shouldValidate: true });
    },
    [form],
  );

  async function onSubmitEdit(values: EditVisitFormValues) {
    setIsSubmitting(true);
    try {
      const startMs = new Date(`${values.date}T${values.time_start}`).getTime();
      const endMs = new Date(`${values.date}T${values.time_end}`).getTime();

      await editVisit({
        id: data.visit._id,
        scheduled_start: startMs,
        scheduled_end: endMs,
        assigned_guard_id: values.guard_id as Id<"users">,
      });

      toast.success("Visit updated");
      setIsEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update visit");
    } finally {
      setIsSubmitting(false);
    }
  }

  const renderEntityLink = (id: string | null | undefined, label: string, href: string) => {
    if (!id) {
      return <span>{label}</span>;
    }

    return (
      <Link href={href} className="text-blue-600 hover:underline">
        {label}
      </Link>
    );
  };

  const leadLabel = `${data.building?.name ?? "—"} / Fl${data.lead?.floor_number ?? "—"} / ${data.lead?.flat_number ?? "—"}`;

  const relatedItems: Array<{
    key: string;
    label: string;
    href: string;
    text: string;
    icon: React.ReactNode;
  }> = [];

  if (data.society?._id) {
    relatedItems.push({
      key: "society",
      label: "Society",
      href: `/admin/societies/${data.society._id}`,
      text: data.society.name,
      icon: <Building2 className="size-3.5" />,
    });
  }

  if (data.society?._id) {
    relatedItems.push({
      key: "flat",
      label: "Building / Flat",
      href: `/admin/societies/${data.society._id}`,
      text: leadLabel,
      icon: <Home className="size-3.5" />,
    });
  }

  if (data.lead?._id) {
    relatedItems.push({
      key: "lead",
      label: "Lead",
      href: `/admin/leads?id=${data.lead._id}`,
      text: `Lead #${data.lead._id.slice(0, 8)}`,
      icon: <ClipboardList className="size-3.5" />,
    });
  }

  if (data.listing?._id) {
    relatedItems.push({
      key: "listing",
      label: "Listing",
      href: `/admin/listings/${data.listing._id}`,
      text: `Listing #${data.listing._id.slice(0, 8)}`,
      icon: <FileText className="size-3.5" />,
    });
  }

  relatedItems.push({
    key: "visit",
    label: "Visit",
    href: `/admin/visits/${data.visit._id}`,
    text: `Visit #${data.visit._id.slice(0, 8)}`,
    icon: <Eye className="size-3.5" />,
  });

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-900">Schedule</CardTitle>
            {canEdit && !isTerminal && !isEditing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="gap-1.5 text-slate-600"
              >
                <Pencil className="size-3.5" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitEdit)} className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <DatePicker value={field.value} onChange={field.onChange} />
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
                        <FormLabel>Start</FormLabel>
                        <FormControl>
                          <TimePicker
                            value={field.value}
                            onChange={field.onChange}
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
                        <FormLabel>End</FormLabel>
                        <FormControl>
                          <TimePicker
                            value={field.value}
                            onChange={field.onChange}
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
                      <FormLabel>Assign Guard</FormLabel>
                      {data.lead && scheduledStartMs > 0 && scheduledEndMs > 0 ? (
                        <GuardAvailabilityGrid
                          society_id={data.visit.society_id}
                          building_id={data.lead.building_id}
                          date={scheduledStartMs}
                          time_start={scheduledStartMs}
                          time_end={scheduledEndMs}
                          value={
                            form.getValues("guard_id")
                              ? (form.getValues("guard_id") as Id<"users">)
                              : undefined
                          }
                          onChange={handleGuardSelect}
                        />
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-300 py-4 text-center text-sm text-slate-400">
                          Set date and time to see available guards
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      form.reset();
                    }}
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
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-slate-500">Start</dt>
                <dd className="font-medium text-slate-900">
                  {IST_DATE_FORMATTER.format(data.visit.scheduled_start)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">End</dt>
                <dd className="font-medium text-slate-900">
                  {IST_DATE_FORMATTER.format(data.visit.scheduled_end)}
                </dd>
              </div>
              {data.visit.started_at && (
                <div>
                  <dt className="text-slate-500">Started At</dt>
                  <dd className="font-medium text-slate-900">
                    {IST_DATE_FORMATTER.format(data.visit.started_at)}
                  </dd>
                </div>
              )}
              {data.visit.completed_at && (
                <div>
                  <dt className="text-slate-500">Completed At</dt>
                  <dd className="font-medium text-slate-900">
                    {IST_DATE_FORMATTER.format(data.visit.completed_at)}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">Guard Assignment</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Guard</dt>
              <dd className="font-medium text-slate-900">
                {renderEntityLink(
                  data.guard?.user_id,
                  data.guard?.name ?? "—",
                  `/admin/guards/${data.guard?.user_id}`,
                )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Type</dt>
              <dd className="text-slate-700">
                {data.guard?.guard_type
                  ? (GUARD_TYPE_LABELS[data.guard.guard_type] ?? data.guard.guard_type)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Guard Status</dt>
              <dd className="text-slate-700">{data.guard?.status ?? "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Lead</dt>
              <dd className="font-medium text-slate-900">
                {renderEntityLink(data.lead?._id, leadLabel, `/admin/leads?id=${data.lead?._id}`)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {data.visit.outcome && (
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-900">Outcome</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Result</dt>
                <dd className="font-medium text-slate-900">
                  {OUTCOME_LABELS[data.visit.outcome] ?? data.visit.outcome}
                </dd>
              </div>
              {data.visit.outcome_notes && (
                <div>
                  <dt className="text-slate-500">Notes</dt>
                  <dd className="text-slate-700">{data.visit.outcome_notes}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">Related</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {relatedItems.map((item) => (
            <div key={item.key} className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">{item.icon}</span>
              <span className="text-xs uppercase tracking-wide text-slate-500">{item.label}</span>
              <Link href={item.href} className="font-medium text-blue-600 hover:underline">
                {item.text}
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>

      {data.listing && (
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-900">Linked Listing</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/admin/listings/${data.listing._id}`}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              View Listing &rarr;
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
