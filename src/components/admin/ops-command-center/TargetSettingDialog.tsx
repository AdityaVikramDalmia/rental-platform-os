"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Target } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { KPI_METRICS } from "@/components/admin/ops-command-center/metric-options";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = {
  WEEKLY: 7,
  MONTHLY: 30,
  QUARTERLY: 90,
} as const;

const targetFormSchema = z.object({
  agent_user_id: z.string().trim().min(1, "Agent is required"),
  metric: z.enum([
    "visits_completed",
    "closures_confirmed",
    "leads_verified",
    "quality_score_min",
    "checklist_approval_rate",
    "document_collection_rate",
    "negotiation_closures",
    "visit_no_show_rate_max",
    "tenant_inquiry_resolutions",
  ]),
  target_value: z.number().gt(0, "Target value must be greater than 0"),
  period_type: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY"]),
  period_start: z.number(),
  notes: z.string().trim().optional(),
});

type TargetFormValues = z.infer<typeof targetFormSchema>;

type TargetSettingDialogProps = {
  open: boolean;
  action: (open: boolean) => void;
  preselectedAgentId?: string;
};

function getTomorrowStartTimestamp(): number {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getTime();
}

function toDateInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value: string): number {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  const parsedDate = new Date(year, month - 1, day);
  parsedDate.setHours(0, 0, 0, 0);
  return parsedDate.getTime();
}

function computePeriodEnd(
  periodStart: number,
  periodType: TargetFormValues["period_type"],
): number {
  return periodStart + PERIOD_DAYS[periodType] * DAY_MS;
}

export function TargetSettingDialog({
  open,
  action,
  preselectedAgentId,
}: TargetSettingDialogProps) {
  const createTarget = useMutation(api.opsManagement.createTarget);
  const teamHealthRows = useQuery(api.opsManagement.getTeamHealthHeatmap);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TargetFormValues>({
    resolver: zodResolver(targetFormSchema),
    defaultValues: {
      agent_user_id: preselectedAgentId ?? "",
      metric: "visits_completed",
      target_value: 1,
      period_type: "WEEKLY",
      period_start: getTomorrowStartTimestamp(),
      notes: "",
    },
  });

  const periodType = form.watch("period_type");
  const periodStart = form.watch("period_start");

  const periodEnd = useMemo(
    () => computePeriodEnd(periodStart, periodType),
    [periodStart, periodType],
  );

  const activeOpsUsers = useMemo(() => {
    if (!teamHealthRows) {
      return [];
    }

    return teamHealthRows
      .map((row) => ({
        _id: row.user_id,
        name: row.name,
        phone: row.phone,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teamHealthRows]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setIsSubmitting(false);
    form.reset({
      agent_user_id: preselectedAgentId ?? "",
      metric: "visits_completed",
      target_value: 1,
      period_type: "WEEKLY",
      period_start: getTomorrowStartTimestamp(),
      notes: "",
    });
  }, [form, open, preselectedAgentId]);

  const handleDialogClose = useCallback(
    (nextOpen: boolean) => {
      action(nextOpen);

      if (!nextOpen) {
        setIsSubmitting(false);
        form.reset();
      }
    },
    [action, form],
  );

  async function onSubmit(values: TargetFormValues) {
    setIsSubmitting(true);
    try {
      await createTarget({
        agent_user_id: values.agent_user_id as Id<"users">,
        metric: values.metric,
        target_value: values.target_value,
        period_type: values.period_type,
        period_start: values.period_start,
        period_end: computePeriodEnd(values.period_start, values.period_type),
        notes: values.notes?.trim() ? values.notes.trim() : undefined,
      });

      toast.success("Target created successfully");
      handleDialogClose(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create target";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="size-5 text-slate-600" />
            Set KPI Target
          </DialogTitle>
          <DialogDescription>
            Assign a KPI target to an active OPS agent for a weekly, monthly, or quarterly cycle.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="agent_user_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agent</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            teamHealthRows === undefined ? "Loading agents..." : "Select agent"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeOpsUsers.map((agent) => (
                        <SelectItem key={agent._id} value={agent._id}>
                          {agent.name}
                          {agent.phone ? ` (${agent.phone})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="metric"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Metric</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select metric" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {KPI_METRICS.map((metric) => (
                          <SelectItem key={metric.value} value={metric.value}>
                            {metric.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="target_value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Value</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={field.value}
                        onChange={(event) => {
                          field.onChange(Number.parseFloat(event.target.value));
                        }}
                        placeholder="Enter target value"
                        className="h-10 border-slate-300"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="period_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                        <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="period_start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period Start</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={toDateInputValue(field.value)}
                        minDate={toDateInputValue(getTomorrowStartTimestamp())}
                        onChange={(value) => {
                          field.onChange(fromDateInputValue(value));
                        }}
                        placeholder="Select start date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Period end will be set automatically to{" "}
              <span className="font-semibold text-slate-800">
                {new Date(periodEnd).toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              .
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={3}
                      placeholder="Optional context for this target"
                      className="border-slate-300"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || activeOpsUsers.length === 0}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Target"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
