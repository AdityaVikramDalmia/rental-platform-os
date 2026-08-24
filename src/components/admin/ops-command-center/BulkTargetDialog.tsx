"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { CalendarSync, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KPI_METRICS } from "@/components/admin/ops-command-center/metric-options";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = {
  WEEKLY: 7,
  MONTHLY: 30,
  QUARTERLY: 90,
} as const;
const PERIOD_TYPES = ["WEEKLY", "MONTHLY", "QUARTERLY"] as const;
const METRIC_VALUES = KPI_METRICS.map((metric) => metric.value) as [
  (typeof KPI_METRICS)[number]["value"],
  ...(typeof KPI_METRICS)[number]["value"][],
];

type BulkTargetTab = "template" | "roll_forward";

type BulkTargetDialogProps = {
  open: boolean;
  action: (open: boolean) => void;
};

type TemplateEntry = {
  metric: (typeof KPI_METRICS)[number]["value"];
  target_value: number;
};

const applyTemplateSchema = z
  .object({
    period_type: z.enum(PERIOD_TYPES),
    period_start: z.number(),
    entries: z.array(
      z.object({
        metric: z.enum(METRIC_VALUES),
        target_value: z.string().optional(),
      }),
    ),
  })
  .superRefine((values, ctx) => {
    let hasValidMetric = false;

    values.entries.forEach((entry, index) => {
      const rawValue = entry.target_value?.trim() ?? "";
      if (rawValue.length === 0) {
        return;
      }

      const parsedValue = Number(rawValue);
      if (!Number.isFinite(parsedValue)) {
        ctx.addIssue({
          code: "custom",
          path: ["entries", index, "target_value"],
          message: "Enter a valid number",
        });
        return;
      }

      if (parsedValue <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["entries", index, "target_value"],
          message: "Target must be greater than 0",
        });
        return;
      }

      hasValidMetric = true;
    });

    if (!hasValidMetric) {
      ctx.addIssue({
        code: "custom",
        path: ["entries"],
        message: "Enter at least one target value",
      });
    }
  });

const rollForwardSchema = z
  .object({
    source_period_start: z.number(),
    source_period_end: z.number(),
    new_period_start: z.number(),
    new_period_end: z.number(),
    adjustment_pct: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.source_period_end <= values.source_period_start) {
      ctx.addIssue({
        code: "custom",
        path: ["source_period_end"],
        message: "Source period end must be after source start",
      });
    }

    if (values.new_period_end <= values.new_period_start) {
      ctx.addIssue({
        code: "custom",
        path: ["new_period_end"],
        message: "New period end must be after new start",
      });
    }

    const adjustmentPct = Number(values.adjustment_pct);
    if (!Number.isFinite(adjustmentPct)) {
      ctx.addIssue({
        code: "custom",
        path: ["adjustment_pct"],
        message: "Enter a valid adjustment percentage",
      });
      return;
    }

    if (adjustmentPct <= -100) {
      ctx.addIssue({
        code: "custom",
        path: ["adjustment_pct"],
        message: "Adjustment must be greater than -100%",
      });
    }
  });

type ApplyTemplateFormValues = z.infer<typeof applyTemplateSchema>;
type RollForwardFormValues = z.infer<typeof rollForwardSchema>;

function getTodayStartTimestamp(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function getTomorrowStartTimestamp(): number {
  return getTodayStartTimestamp() + DAY_MS;
}

function computePeriodEnd(
  periodStart: number,
  periodType: ApplyTemplateFormValues["period_type"],
): number {
  return periodStart + PERIOD_DAYS[periodType] * DAY_MS;
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

function hasPeriodOverlap(
  existingPeriodStart: number,
  existingPeriodEnd: number,
  periodStart: number,
  periodEnd: number,
): boolean {
  return existingPeriodStart < periodEnd && existingPeriodEnd > periodStart;
}

function createTemplateDefaultValues(): ApplyTemplateFormValues {
  return {
    period_type: "WEEKLY",
    period_start: getTomorrowStartTimestamp(),
    entries: KPI_METRICS.map((metric) => ({
      metric: metric.value,
      target_value: "",
    })),
  };
}

function createRollForwardDefaultValues(): RollForwardFormValues {
  const tomorrowStart = getTomorrowStartTimestamp();

  return {
    source_period_start: tomorrowStart - 7 * DAY_MS,
    source_period_end: tomorrowStart,
    new_period_start: tomorrowStart,
    new_period_end: tomorrowStart + 7 * DAY_MS,
    adjustment_pct: "0",
  };
}

function extractTemplateEntries(entries: ApplyTemplateFormValues["entries"]): Array<TemplateEntry> {
  const result: Array<TemplateEntry> = [];

  entries.forEach((entry) => {
    const rawValue = entry.target_value?.trim() ?? "";
    if (rawValue.length === 0) {
      return;
    }

    const targetValue = Number(rawValue);
    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      return;
    }

    result.push({
      metric: entry.metric,
      target_value: targetValue,
    });
  });

  return result;
}

function formatDateLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BulkTargetDialog({ open, action }: BulkTargetDialogProps) {
  const applyTargetTemplateMutation = useMutation(api.opsManagement.applyTargetTemplate);
  const rollForwardTargetsMutation = useMutation(api.opsManagement.rollForwardTargets);
  const teamHealthRows = useQuery(api.opsManagement.getTeamHealthHeatmap);
  const allTargets = useQuery(api.opsManagement.listAllTargets, { limit: 1000 });

  const [activeTab, setActiveTab] = useState<BulkTargetTab>("template");
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [isRollingForward, setIsRollingForward] = useState(false);

  const applyTemplateForm = useForm<ApplyTemplateFormValues>({
    resolver: zodResolver(applyTemplateSchema),
    defaultValues: createTemplateDefaultValues(),
  });

  const rollForwardForm = useForm<RollForwardFormValues>({
    resolver: zodResolver(rollForwardSchema),
    defaultValues: createRollForwardDefaultValues(),
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveTab("template");
    setIsApplyingTemplate(false);
    setIsRollingForward(false);
    applyTemplateForm.reset(createTemplateDefaultValues());
    rollForwardForm.reset(createRollForwardDefaultValues());
  }, [applyTemplateForm, open, rollForwardForm]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      action(nextOpen);

      if (!nextOpen) {
        setIsApplyingTemplate(false);
        setIsRollingForward(false);
      }
    },
    [action],
  );

  const applyValues = applyTemplateForm.watch();
  const rollValues = rollForwardForm.watch();

  const templateEntries = useMemo(
    () => extractTemplateEntries(applyValues.entries),
    [applyValues.entries],
  );

  const applyPeriodEnd = useMemo(
    () => computePeriodEnd(applyValues.period_start, applyValues.period_type),
    [applyValues.period_start, applyValues.period_type],
  );

  const activeOpsCount = teamHealthRows?.length ?? 0;

  const overlapPreviewCount = useMemo(() => {
    if (!teamHealthRows || !allTargets || templateEntries.length === 0) {
      return 0;
    }

    const activeTargetsByAgentMetric = new Map<
      string,
      Array<{ period_start: number; period_end: number }>
    >();

    allTargets
      .filter((target) => target.status === "ACTIVE")
      .forEach((target) => {
        const key = `${target.agent_user_id}:${target.metric}`;
        const existing = activeTargetsByAgentMetric.get(key);
        const period = { period_start: target.period_start, period_end: target.period_end };
        if (existing) {
          existing.push(period);
        } else {
          activeTargetsByAgentMetric.set(key, [period]);
        }
      });

    let overlaps = 0;
    for (const agent of teamHealthRows) {
      for (const templateEntry of templateEntries) {
        const key = `${agent.user_id}:${templateEntry.metric}`;
        const activePeriods = activeTargetsByAgentMetric.get(key) ?? [];
        if (
          activePeriods.some((period) =>
            hasPeriodOverlap(
              period.period_start,
              period.period_end,
              applyValues.period_start,
              applyPeriodEnd,
            ),
          )
        ) {
          overlaps += 1;
        }
      }
    }

    return overlaps;
  }, [allTargets, applyPeriodEnd, applyValues.period_start, teamHealthRows, templateEntries]);

  const totalTemplateOperations = activeOpsCount * templateEntries.length;
  const createPreviewCount = Math.max(0, totalTemplateOperations - overlapPreviewCount);

  const sourceTargetsCount = useMemo(() => {
    if (!allTargets) {
      return 0;
    }

    return allTargets.filter(
      (target) =>
        target.period_start === rollValues.source_period_start &&
        target.period_end === rollValues.source_period_end,
    ).length;
  }, [allTargets, rollValues.source_period_end, rollValues.source_period_start]);

  const adjustmentPctValue = useMemo(() => {
    const parsedValue = Number(rollValues.adjustment_pct);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }, [rollValues.adjustment_pct]);

  async function submitTemplate(values: ApplyTemplateFormValues) {
    const template = extractTemplateEntries(values.entries);
    if (template.length === 0) {
      toast.error("Enter at least one target value before applying template");
      return;
    }

    setIsApplyingTemplate(true);
    try {
      const result = await applyTargetTemplateMutation({
        template,
        period_type: values.period_type,
        period_start: values.period_start,
        period_end: computePeriodEnd(values.period_start, values.period_type),
      });

      toast.success(`Template applied: ${result.created} created, ${result.skipped} skipped`);
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} errors while applying template`);
      }
      handleOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply template";
      toast.error(message);
    } finally {
      setIsApplyingTemplate(false);
    }
  }

  async function submitRollForward(values: RollForwardFormValues) {
    setIsRollingForward(true);
    try {
      const adjustmentPct = Number(values.adjustment_pct);
      const result = await rollForwardTargetsMutation({
        source_period_start: values.source_period_start,
        source_period_end: values.source_period_end,
        new_period_start: values.new_period_start,
        new_period_end: values.new_period_end,
        adjustment_pct: adjustmentPct,
      });

      toast.success(`Roll-forward completed: ${result.created} created, ${result.skipped} skipped`);
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} errors during roll-forward`);
      }
      handleOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to roll forward targets";
      toast.error(message);
    } finally {
      setIsRollingForward(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarSync className="size-5 text-slate-600" />
            Bulk Target Operations
          </DialogTitle>
          <DialogDescription>
            Apply a KPI template to all active OPS agents or roll forward targets from a prior
            period.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as BulkTargetTab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="template">Apply Template</TabsTrigger>
            <TabsTrigger value="roll_forward">Roll Forward</TabsTrigger>
          </TabsList>

          <TabsContent value="template" className="mt-4">
            <Form {...applyTemplateForm}>
              <form
                onSubmit={applyTemplateForm.handleSubmit(submitTemplate)}
                className="space-y-4"
                noValidate
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={applyTemplateForm.control}
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
                    control={applyTemplateForm.control}
                    name="period_start"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Period Start</FormLabel>
                        <FormControl>
                          <DatePicker
                            value={toDateInputValue(field.value)}
                            minDate={toDateInputValue(getTomorrowStartTimestamp())}
                            onChange={(value) => field.onChange(fromDateInputValue(value))}
                            placeholder="Select start date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Period end auto-computed as{" "}
                  <span className="font-semibold text-slate-800">
                    {formatDateLabel(applyPeriodEnd)}
                  </span>
                  .
                </div>

                <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">Metric Targets</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {KPI_METRICS.map((metric, index) => (
                      <FormField
                        key={metric.value}
                        control={applyTemplateForm.control}
                        name={`entries.${index}.target_value`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{metric.label}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={field.value ?? ""}
                                onChange={(event) => field.onChange(event.target.value)}
                                placeholder="Leave empty to skip"
                                className="h-10 border-slate-300"
                              />
                            </FormControl>
                            <p className="text-xs text-slate-500">{metric.description}</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  {applyTemplateForm.formState.errors.entries?.message ? (
                    <p className="text-sm font-medium text-red-600">
                      {applyTemplateForm.formState.errors.entries.message}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  Will create{" "}
                  <span className="font-semibold text-slate-900">{createPreviewCount}</span> targets
                  for <span className="font-semibold text-slate-900">{activeOpsCount}</span> agents
                  (<span className="font-semibold text-slate-900">{overlapPreviewCount}</span> will
                  be skipped due to overlap).
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      isApplyingTemplate || teamHealthRows === undefined || allTargets === undefined
                    }
                  >
                    {isApplyingTemplate ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Applying...
                      </>
                    ) : (
                      "Apply Template"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="roll_forward" className="mt-4">
            <Form {...rollForwardForm}>
              <form
                onSubmit={rollForwardForm.handleSubmit(submitRollForward)}
                className="space-y-4"
                noValidate
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={rollForwardForm.control}
                    name="source_period_start"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Source Period Start</FormLabel>
                        <FormControl>
                          <DatePicker
                            value={toDateInputValue(field.value)}
                            onChange={(value) => field.onChange(fromDateInputValue(value))}
                            placeholder="Select source start"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={rollForwardForm.control}
                    name="source_period_end"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Source Period End</FormLabel>
                        <FormControl>
                          <DatePicker
                            value={toDateInputValue(field.value)}
                            onChange={(value) => field.onChange(fromDateInputValue(value))}
                            placeholder="Select source end"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={rollForwardForm.control}
                    name="new_period_start"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Period Start</FormLabel>
                        <FormControl>
                          <DatePicker
                            value={toDateInputValue(field.value)}
                            minDate={toDateInputValue(getTomorrowStartTimestamp())}
                            onChange={(value) => field.onChange(fromDateInputValue(value))}
                            placeholder="Select new start"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={rollForwardForm.control}
                    name="new_period_end"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Period End</FormLabel>
                        <FormControl>
                          <DatePicker
                            value={toDateInputValue(field.value)}
                            minDate={toDateInputValue(getTomorrowStartTimestamp())}
                            onChange={(value) => field.onChange(fromDateInputValue(value))}
                            placeholder="Select new end"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={rollForwardForm.control}
                  name="adjustment_pct"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adjustment Percentage</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          value={field.value}
                          onChange={(event) => field.onChange(event.target.value)}
                          className="h-10 border-slate-300"
                          placeholder="0"
                        />
                      </FormControl>
                      <p className="text-xs text-slate-500">
                        Example: 10 for +10%, -5 for -5%, 0 for no change.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  Will copy{" "}
                  <span className="font-semibold text-slate-900">{sourceTargetsCount}</span> targets
                  from source period to new period with{" "}
                  <span className="font-semibold text-slate-900">
                    {adjustmentPctValue >= 0 ? "+" : ""}
                    {adjustmentPctValue.toFixed(2)}%
                  </span>{" "}
                  adjustment.
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isRollingForward || allTargets === undefined}>
                    {isRollingForward ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Rolling Forward...
                      </>
                    ) : (
                      "Roll Forward"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
