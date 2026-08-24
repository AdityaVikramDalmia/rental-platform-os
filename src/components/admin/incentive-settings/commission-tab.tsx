"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import {
  COMMISSION_BOUNDS,
  COMMISSION_METRIC_SOURCE,
  CONFIG_VERSION_STATUS,
  INCENTIVE_PERSONA,
  MODIFIER_LINK_MODE,
  MODIFIER_REWARD_MODE,
  MODIFIER_RULE_TYPE,
} from "../../../../lib/constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type ConfigVersion = Doc<"incentive_config_versions">;
type ModifierTemplate = Doc<"commission_modifier_templates">;
type MetricSourceValue = (typeof COMMISSION_METRIC_SOURCE)[keyof typeof COMMISSION_METRIC_SOURCE];

const METRIC_SOURCE_VALUES = Object.values(COMMISSION_METRIC_SOURCE) as MetricSourceValue[];

const bpsSchema = z.string().trim().min(1, "Value is required");

function parseRequiredBps(value: string, fieldName: string, ctx: z.RefinementCtx): number | null {
  if (!/^\d+$/.test(value)) {
    ctx.addIssue({
      code: "custom",
      path: [fieldName],
      message: "Value must be a whole number",
    });
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000) {
    ctx.addIssue({
      code: "custom",
      path: [fieldName],
      message: "Value must be between 0 and 10000",
    });
    return null;
  }

  return parsed;
}

const commissionSchema = z
  .object({
    base_rate_bps: bpsSchema,
    min_rate_bps: bpsSchema,
    max_rate_bps: bpsSchema,
  })
  .superRefine((values, ctx) => {
    const base = parseRequiredBps(values.base_rate_bps, "base_rate_bps", ctx);
    const min = parseRequiredBps(values.min_rate_bps, "min_rate_bps", ctx);
    const max = parseRequiredBps(values.max_rate_bps, "max_rate_bps", ctx);

    if (base === null || min === null || max === null) {
      return;
    }

    if (min > max) {
      ctx.addIssue({
        code: "custom",
        path: ["max_rate_bps"],
        message: "max_rate_bps must be greater than or equal to min_rate_bps",
      });
    }

    if (base < min) {
      ctx.addIssue({
        code: "custom",
        path: ["base_rate_bps"],
        message: "base_rate_bps cannot be less than min_rate_bps",
      });
    }

    if (base > max) {
      ctx.addIssue({
        code: "custom",
        path: ["base_rate_bps"],
        message: "base_rate_bps cannot exceed max_rate_bps",
      });
    }
  });

const modifierSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    description: z.string().optional(),
    persona: z.enum([
      INCENTIVE_PERSONA.GUARD,
      INCENTIVE_PERSONA.OPS,
      INCENTIVE_PERSONA.SALES,
      INCENTIVE_PERSONA.RM,
      INCENTIVE_PERSONA.LIAISON,
      INCENTIVE_PERSONA.ALL,
    ]),
    reward_mode: z.enum([MODIFIER_REWARD_MODE.BPS, MODIFIER_REWARD_MODE.FLAT_PAISE]),
    rule_type: z.enum([
      MODIFIER_RULE_TYPE.THRESHOLD_STEP,
      MODIFIER_RULE_TYPE.LINEAR_BAND,
      MODIFIER_RULE_TYPE.PENALTY_STEP,
    ]),
    metric_source: z.enum([
      COMMISSION_METRIC_SOURCE.AVG_DOC_PROCESSING_HOURS,
      COMMISSION_METRIC_SOURCE.ON_TIME_VISIT_RATE,
      COMMISSION_METRIC_SOURCE.AVG_CHECKLIST_SCORE,
      COMMISSION_METRIC_SOURCE.RESPONSE_SPEED_HOURS,
      COMMISSION_METRIC_SOURCE.COMPLETION_RATE,
      COMMISSION_METRIC_SOURCE.PENALTY_COUNT,
      COMMISSION_METRIC_SOURCE.CUSTOM,
    ]),
    rule_config_json: z.string().trim().min(1, "Rule config JSON is required"),
    link_mode: z.enum([
      MODIFIER_LINK_MODE.INDIVIDUAL,
      MODIFIER_LINK_MODE.AND_GROUP,
      MODIFIER_LINK_MODE.OR_GROUP,
    ]),
    link_group_id: z.string().optional(),
    sort_order: z
      .string()
      .trim()
      .min(1, "Sort order is required")
      .regex(/^\d+$/, "Sort order must be a non-negative integer"),
  })
  .superRefine((values, ctx) => {
    if (
      values.link_mode !== MODIFIER_LINK_MODE.INDIVIDUAL &&
      !(values.link_group_id && values.link_group_id.trim().length > 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["link_group_id"],
        message: "link_group_id is required for grouped link modes",
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(values.rule_config_json) as unknown;
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["rule_config_json"],
        message: "Rule config must be valid JSON",
      });
      return;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      ctx.addIssue({
        code: "custom",
        path: ["rule_config_json"],
        message: "Rule config must be a JSON object",
      });
      return;
    }

    const ruleConfig = parsed as Record<string, unknown>;
    const getNumericField = (...keys: string[]): number | undefined => {
      for (const key of keys) {
        const value = ruleConfig[key];
        if (typeof value === "number" && Number.isFinite(value)) {
          return value;
        }
      }
      return undefined;
    };

    const threshold = getNumericField("threshold");
    const thresholdUpper = getNumericField("threshold_upper");
    const slopePerUnit = getNumericField("slope_per_unit");
    const deltaBps = getNumericField("delta_bps", "delta_value");
    const deltaPaise = getNumericField("delta_paise", "delta_value");

    if (
      values.rule_type === MODIFIER_RULE_TYPE.THRESHOLD_STEP ||
      values.rule_type === MODIFIER_RULE_TYPE.PENALTY_STEP
    ) {
      if (threshold === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["rule_config_json"],
          message: "Step rules require numeric threshold",
        });
      }

      if (values.reward_mode === MODIFIER_REWARD_MODE.BPS && deltaBps === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["rule_config_json"],
          message: "BPS mode requires delta_bps or delta_value",
        });
      }

      if (values.reward_mode === MODIFIER_REWARD_MODE.FLAT_PAISE && deltaPaise === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["rule_config_json"],
          message: "FLAT_PAISE mode requires delta_paise or delta_value",
        });
      }
    }

    if (values.rule_type === MODIFIER_RULE_TYPE.LINEAR_BAND) {
      if (threshold === undefined || thresholdUpper === undefined || slopePerUnit === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["rule_config_json"],
          message: "linear_band requires threshold, threshold_upper, and slope_per_unit",
        });
      }

      if (threshold !== undefined && thresholdUpper !== undefined && thresholdUpper <= threshold) {
        ctx.addIssue({
          code: "custom",
          path: ["rule_config_json"],
          message: "threshold_upper must be greater than threshold",
        });
      }
    }
  });

type CommissionFormValues = z.infer<typeof commissionSchema>;
type ModifierFormValues = z.infer<typeof modifierSchema>;

type CommissionTabProps = {
  canConfigure: boolean;
};

type ParsedConfig = {
  commission: {
    base_rate_bps: number;
    min_rate_bps: number;
    max_rate_bps: number;
  };
  raw: Record<string, unknown>;
};

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function parseBpsValue(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fallback;
  }

  if (value < 0 || value > 10000) {
    return fallback;
  }

  return value;
}

function parseConfig(version: ConfigVersion | null | undefined): ParsedConfig {
  if (!version) {
    return {
      commission: {
        base_rate_bps: COMMISSION_BOUNDS.DEFAULT_BASE_BPS,
        min_rate_bps: COMMISSION_BOUNDS.DEFAULT_MIN_BPS,
        max_rate_bps: COMMISSION_BOUNDS.DEFAULT_MAX_BPS,
      },
      raw: {},
    };
  }

  const raw = parseJsonObject(version.config_json);
  const commissionRaw =
    typeof raw.commission === "object" && raw.commission !== null && !Array.isArray(raw.commission)
      ? (raw.commission as Record<string, unknown>)
      : {};

  const minRate = parseBpsValue(
    commissionRaw.min_rate_bps,
    parseBpsValue(commissionRaw.base_rate_bps, COMMISSION_BOUNDS.DEFAULT_MIN_BPS),
  );
  const maxRate = parseBpsValue(commissionRaw.max_rate_bps, COMMISSION_BOUNDS.DEFAULT_MAX_BPS);
  const baseRate = parseBpsValue(
    commissionRaw.base_rate_bps,
    Math.min(Math.max(COMMISSION_BOUNDS.DEFAULT_BASE_BPS, minRate), maxRate),
  );

  return {
    commission: {
      base_rate_bps: Math.min(Math.max(baseRate, minRate), maxRate),
      min_rate_bps: minRate,
      max_rate_bps: Math.max(maxRate, minRate),
    },
    raw,
  };
}

function formatPercentFromBps(bps: number | string): string {
  const parsed = typeof bps === "string" ? Number(bps) : bps;
  if (!Number.isFinite(parsed)) {
    return "-";
  }

  return `${(parsed / 100).toFixed(2)}%`;
}

function buildModifierPayload(values: ModifierFormValues) {
  return {
    name: values.name.trim(),
    description: values.description?.trim() || undefined,
    persona: values.persona,
    reward_mode: values.reward_mode,
    rule_type: values.rule_type,
    metric_source: values.metric_source,
    rule_config_json: JSON.stringify(JSON.parse(values.rule_config_json) as unknown),
    link_mode: values.link_mode,
    link_group_id:
      values.link_mode === MODIFIER_LINK_MODE.INDIVIDUAL
        ? undefined
        : values.link_group_id?.trim() || undefined,
    sort_order: Number(values.sort_order),
  };
}

function normalizeMetricSource(value: string | undefined): MetricSourceValue {
  if (value && METRIC_SOURCE_VALUES.includes(value as MetricSourceValue)) {
    return value as MetricSourceValue;
  }

  return COMMISSION_METRIC_SOURCE.AVG_DOC_PROCESSING_HOURS;
}

export function CommissionTab({ canConfigure }: CommissionTabProps) {
  const versionsPage = useQuery(api.incentiveConfig.list, {
    paginationOpts: { numItems: 200, cursor: null },
  });
  const updateDraft = useMutation(api.incentiveConfig.updateDraft);

  const createModifierTemplate = useMutation(api.commissionModifierTemplates.create);
  const updateModifierTemplate = useMutation(api.commissionModifierTemplates.update);
  const archiveModifierTemplate = useMutation(api.commissionModifierTemplates.archive);
  const reactivateModifierTemplate = useMutation(api.commissionModifierTemplates.reactivate);

  const [isSavingBaseRates, setIsSavingBaseRates] = useState(false);
  const [selectedPersonaFilter, setSelectedPersonaFilter] = useState<
    (typeof INCENTIVE_PERSONA)[keyof typeof INCENTIVE_PERSONA]
  >(INCENTIVE_PERSONA.GUARD);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [isModifierDialogOpen, setIsModifierDialogOpen] = useState(false);
  const [editingModifier, setEditingModifier] = useState<ModifierTemplate | null>(null);
  const [modifierToggleTarget, setModifierToggleTarget] = useState<ModifierTemplate | null>(null);
  const [isSavingModifier, setIsSavingModifier] = useState(false);
  const [isTogglingModifier, setIsTogglingModifier] = useState(false);

  const modifierTemplatesQuery = useQuery(api.commissionModifierTemplates.listByPersona, {
    persona: selectedPersonaFilter,
    includeArchived,
  });

  const versions = versionsPage?.page ?? [];
  const latestDraft = useMemo(
    () => versions.find((version) => version.status === CONFIG_VERSION_STATUS.DRAFT) ?? null,
    [versions],
  );
  const parsedDraft = useMemo(() => parseConfig(latestDraft), [latestDraft]);

  const modifierTemplates = useMemo(() => {
    const templates = modifierTemplatesQuery ?? [];
    return [...templates].sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }

      if (a.name !== b.name) {
        return a.name.localeCompare(b.name);
      }

      return a._creationTime - b._creationTime;
    });
  }, [modifierTemplatesQuery]);

  const baseRatesForm = useForm<CommissionFormValues>({
    resolver: zodResolver(commissionSchema),
    defaultValues: {
      base_rate_bps: String(parsedDraft.commission.base_rate_bps),
      min_rate_bps: String(parsedDraft.commission.min_rate_bps),
      max_rate_bps: String(parsedDraft.commission.max_rate_bps),
    },
  });

  const modifierForm = useForm<ModifierFormValues>({
    resolver: zodResolver(modifierSchema),
    defaultValues: {
      name: "",
      description: "",
      persona: INCENTIVE_PERSONA.GUARD,
      reward_mode: MODIFIER_REWARD_MODE.BPS,
      rule_type: MODIFIER_RULE_TYPE.THRESHOLD_STEP,
      metric_source: COMMISSION_METRIC_SOURCE.AVG_DOC_PROCESSING_HOURS,
      rule_config_json: '{"threshold": 0, "delta_bps": 0}',
      link_mode: MODIFIER_LINK_MODE.INDIVIDUAL,
      link_group_id: "",
      sort_order: "0",
    } as ModifierFormValues,
  });

  const selectedLinkMode = modifierForm.watch("link_mode");

  useEffect(() => {
    baseRatesForm.reset({
      base_rate_bps: String(parsedDraft.commission.base_rate_bps),
      min_rate_bps: String(parsedDraft.commission.min_rate_bps),
      max_rate_bps: String(parsedDraft.commission.max_rate_bps),
    });
  }, [baseRatesForm, parsedDraft]);

  useEffect(() => {
    if (!isModifierDialogOpen) {
      return;
    }

    modifierForm.reset({
      name: editingModifier?.name ?? "",
      description: editingModifier?.description ?? "",
      persona:
        editingModifier?.persona ??
        (selectedPersonaFilter === INCENTIVE_PERSONA.ALL
          ? INCENTIVE_PERSONA.GUARD
          : selectedPersonaFilter),
      reward_mode: editingModifier?.reward_mode ?? MODIFIER_REWARD_MODE.BPS,
      rule_type: editingModifier?.rule_type ?? MODIFIER_RULE_TYPE.THRESHOLD_STEP,
      metric_source: normalizeMetricSource(editingModifier?.metric_source),
      rule_config_json: editingModifier?.rule_config_json ?? '{"threshold": 0, "delta_bps": 0}',
      link_mode: editingModifier?.link_mode ?? MODIFIER_LINK_MODE.INDIVIDUAL,
      link_group_id: editingModifier?.link_group_id ?? "",
      sort_order: String(editingModifier?.sort_order ?? 0),
    } as ModifierFormValues);
  }, [editingModifier, isModifierDialogOpen, modifierForm, selectedPersonaFilter]);

  async function onSubmitBaseRates(values: CommissionFormValues) {
    if (!latestDraft) {
      toast.error(
        "Create a draft config version in Program tab before saving commission settings.",
      );
      return;
    }

    setIsSavingBaseRates(true);

    try {
      const baseRateBps = Number(values.base_rate_bps);
      const minRateBps = Number(values.min_rate_bps);
      const maxRateBps = Number(values.max_rate_bps);

      const nextConfig: Record<string, unknown> = {
        ...parsedDraft.raw,
        commission: {
          ...(typeof parsedDraft.raw.commission === "object" &&
          parsedDraft.raw.commission !== null &&
          !Array.isArray(parsedDraft.raw.commission)
            ? (parsedDraft.raw.commission as Record<string, unknown>)
            : {}),
          base_rate_bps: baseRateBps,
          min_rate_bps: minRateBps,
          max_rate_bps: maxRateBps,
        },
      };

      await updateDraft({
        id: latestDraft._id,
        config_json: JSON.stringify(nextConfig),
      });

      toast.success(`Commission settings saved to draft ${latestDraft.version_code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save commission settings");
    } finally {
      setIsSavingBaseRates(false);
    }
  }

  async function onSubmitModifier(values: ModifierFormValues) {
    setIsSavingModifier(true);

    try {
      const payload = buildModifierPayload(values);

      if (editingModifier) {
        await updateModifierTemplate({
          id: editingModifier._id,
          ...payload,
        });
        toast.success("Modifier template updated");
      } else {
        await createModifierTemplate(payload);
        toast.success("Modifier template created");
      }

      setIsModifierDialogOpen(false);
      setEditingModifier(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save modifier template");
    } finally {
      setIsSavingModifier(false);
    }
  }

  async function handleToggleArchiveState() {
    if (!modifierToggleTarget) {
      return;
    }

    setIsTogglingModifier(true);

    try {
      if (modifierToggleTarget.is_active) {
        await archiveModifierTemplate({ id: modifierToggleTarget._id });
        toast.success("Modifier template archived");
      } else {
        await reactivateModifierTemplate({ id: modifierToggleTarget._id });
        toast.success("Modifier template reactivated");
      }

      setModifierToggleTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update modifier template");
    } finally {
      setIsTogglingModifier(false);
    }
  }

  if (versionsPage === undefined || modifierTemplatesQuery === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Base Rate Controls</CardTitle>
          <CardDescription>
            Update commission base/min/max bounds in a DRAFT config version only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            {latestDraft ? (
              <span>
                Editing draft version{" "}
                <span className="font-semibold text-slate-900">{latestDraft.version_code}</span>
              </span>
            ) : (
              <span>
                No DRAFT version found. Create one in Program tab to enable commission saves.
              </span>
            )}
          </div>

          <Form {...baseRatesForm}>
            <form
              onSubmit={baseRatesForm.handleSubmit(onSubmitBaseRates)}
              className="space-y-4"
              noValidate
            >
              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={baseRatesForm.control}
                  name="base_rate_bps"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>base_rate_bps</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={10000}
                          step={1}
                          disabled={!canConfigure || !latestDraft || isSavingBaseRates}
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-slate-500">{formatPercentFromBps(field.value)}</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={baseRatesForm.control}
                  name="min_rate_bps"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>min_rate_bps</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={10000}
                          step={1}
                          disabled={!canConfigure || !latestDraft || isSavingBaseRates}
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-slate-500">{formatPercentFromBps(field.value)}</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={baseRatesForm.control}
                  name="max_rate_bps"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>max_rate_bps</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={10000}
                          step={1}
                          disabled={!canConfigure || !latestDraft || isSavingBaseRates}
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-slate-500">{formatPercentFromBps(field.value)}</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" disabled={!canConfigure || !latestDraft || isSavingBaseRates}>
                {isSavingBaseRates ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save to Draft"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-lg text-slate-900">Modifier Template Editor</CardTitle>
              <CardDescription>
                Templates are draft-only editing inputs. ACTIVE runtime behavior changes only after
                publishing a new config version.
              </CardDescription>
            </div>

            {canConfigure ? (
              <Button
                type="button"
                onClick={() => {
                  setEditingModifier(null);
                  setIsModifierDialogOpen(true);
                }}
              >
                <Plus className="size-4" />
                Create Modifier
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="w-[220px]">
              <Select
                value={selectedPersonaFilter}
                onValueChange={(value) =>
                  setSelectedPersonaFilter(
                    value as (typeof INCENTIVE_PERSONA)[keyof typeof INCENTIVE_PERSONA],
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by persona" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(INCENTIVE_PERSONA).map((persona) => (
                    <SelectItem key={persona} value={persona}>
                      {persona}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <Switch checked={includeArchived} onCheckedChange={setIncludeArchived} />
              <Label className="text-sm font-medium text-slate-700">Include archived</Label>
            </div>

            <Badge variant="outline" className="text-slate-600">
              {modifierTemplates.length} modifier{modifierTemplates.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {modifierTemplates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">
              No modifier templates found for this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-2.5 font-medium">Name</th>
                    <th className="px-3 py-2.5 font-medium">Persona</th>
                    <th className="px-3 py-2.5 font-medium">Reward Mode</th>
                    <th className="px-3 py-2.5 font-medium">Rule Type</th>
                    <th className="px-3 py-2.5 font-medium">Metric Source</th>
                    <th className="px-3 py-2.5 font-medium">Link</th>
                    <th className="px-3 py-2.5 font-medium">Sort</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {modifierTemplates.map((modifier) => (
                    <tr key={modifier._id} className="border-b border-slate-100 text-slate-700">
                      <td className="px-3 py-2.5">
                        <div className="space-y-0.5">
                          <p className="font-medium text-slate-900">{modifier.name}</p>
                          <p className="text-xs text-slate-500">{modifier.description ?? "-"}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{modifier.persona}</td>
                      <td className="px-3 py-2.5">
                        <Badge
                          className={
                            modifier.reward_mode === MODIFIER_REWARD_MODE.BPS
                              ? "bg-blue-100 text-blue-700"
                              : "bg-emerald-100 text-emerald-700"
                          }
                        >
                          {modifier.reward_mode}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">{modifier.rule_type}</td>
                      <td className="px-3 py-2.5">{modifier.metric_source}</td>
                      <td className="px-3 py-2.5">
                        <div className="space-y-0.5">
                          <p>{modifier.link_mode}</p>
                          <p className="text-xs text-slate-500">{modifier.link_group_id ?? "-"}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{modifier.sort_order}</td>
                      <td className="px-3 py-2.5">
                        <Badge
                          className={
                            modifier.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-700"
                          }
                        >
                          {modifier.is_active ? "Active" : "Archived"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          {canConfigure && modifier.is_active ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingModifier(modifier);
                                setIsModifierDialogOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          ) : null}

                          {canConfigure ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setModifierToggleTarget(modifier)}
                            >
                              {modifier.is_active ? "Archive" : "Reactivate"}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isModifierDialogOpen}
        onOpenChange={(open) => {
          setIsModifierDialogOpen(open);
          if (!open) {
            setEditingModifier(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingModifier ? "Edit Modifier Template" : "Create Modifier"}
            </DialogTitle>
            <DialogDescription>
              Editing templates does not affect ACTIVE commission config until a draft version is
              published.
            </DialogDescription>
          </DialogHeader>

          <Form {...modifierForm}>
            <form
              onSubmit={modifierForm.handleSubmit(onSubmitModifier)}
              className="space-y-4"
              noValidate
            >
              <FormField
                control={modifierForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="On-time visit bonus"
                        disabled={isSavingModifier}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={modifierForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ""}
                        rows={3}
                        placeholder="Applies bonus when OPS visit punctuality is above threshold"
                        disabled={isSavingModifier}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={modifierForm.control}
                  name="persona"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Persona</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select persona" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(INCENTIVE_PERSONA).map((persona) => (
                            <SelectItem key={persona} value={persona}>
                              {persona}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={modifierForm.control}
                  name="rule_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rule Type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select rule type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={MODIFIER_RULE_TYPE.THRESHOLD_STEP}>
                            {MODIFIER_RULE_TYPE.THRESHOLD_STEP}
                          </SelectItem>
                          <SelectItem value={MODIFIER_RULE_TYPE.LINEAR_BAND}>
                            {MODIFIER_RULE_TYPE.LINEAR_BAND}
                          </SelectItem>
                          <SelectItem value={MODIFIER_RULE_TYPE.PENALTY_STEP}>
                            {MODIFIER_RULE_TYPE.PENALTY_STEP}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={modifierForm.control}
                name="reward_mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reward Mode</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="grid gap-2 sm:grid-cols-2"
                      >
                        <Label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-medium">
                          <RadioGroupItem value={MODIFIER_REWARD_MODE.BPS} />
                          BPS
                        </Label>
                        <Label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-medium">
                          <RadioGroupItem value={MODIFIER_REWARD_MODE.FLAT_PAISE} />
                          FLAT_PAISE
                        </Label>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={modifierForm.control}
                  name="metric_source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Metric Source</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select metric source" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.values(COMMISSION_METRIC_SOURCE).map((metricSource) => (
                            <SelectItem key={metricSource} value={metricSource}>
                              {metricSource}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={modifierForm.control}
                  name="sort_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min={0}
                          step={1}
                          placeholder="0"
                          disabled={isSavingModifier}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={modifierForm.control}
                  name="link_mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Link Mode</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select link mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={MODIFIER_LINK_MODE.INDIVIDUAL}>
                            {MODIFIER_LINK_MODE.INDIVIDUAL}
                          </SelectItem>
                          <SelectItem value={MODIFIER_LINK_MODE.AND_GROUP}>
                            {MODIFIER_LINK_MODE.AND_GROUP}
                          </SelectItem>
                          <SelectItem value={MODIFIER_LINK_MODE.OR_GROUP}>
                            {MODIFIER_LINK_MODE.OR_GROUP}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedLinkMode !== MODIFIER_LINK_MODE.INDIVIDUAL ? (
                  <FormField
                    control={modifierForm.control}
                    name="link_group_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>link_group_id</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="group-1"
                            disabled={isSavingModifier}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </div>

              <FormField
                control={modifierForm.control}
                name="rule_config_json"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>rule_config_json</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={8}
                        className="font-mono text-xs"
                        placeholder='{"threshold": 90, "delta_bps": 50, "operator": ">="}'
                        disabled={isSavingModifier}
                      />
                    </FormControl>
                    <p className="text-xs text-slate-500">
                      Defines thresholds/bands consumed during config snapshot publish.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModifierDialogOpen(false)}
                  disabled={isSavingModifier}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSavingModifier}>
                  {isSavingModifier ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving...
                    </>
                  ) : editingModifier ? (
                    "Update Modifier"
                  ) : (
                    "Create Modifier"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={modifierToggleTarget !== null}
        onOpenChange={(open) => !open && setModifierToggleTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {modifierToggleTarget?.is_active ? "Archive" : "Reactivate"} modifier template?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {modifierToggleTarget?.is_active
                ? "This template will be archived from the draft template list, but historical config snapshots remain unchanged."
                : "This template will become editable and available for future config snapshot publication."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTogglingModifier}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleArchiveState} disabled={isTogglingModifier}>
              {isTogglingModifier ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : modifierToggleTarget?.is_active ? (
                "Archive"
              ) : (
                "Reactivate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
