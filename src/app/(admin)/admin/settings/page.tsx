"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Pencil, Save, Settings, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../convex/_generated/api";
import { SYSTEM_CONFIG_KEYS } from "../../../../../lib/constants";
import { OpsFieldWorkerRolloutCard } from "@/components/admin/settings/ops-field-worker-rollout-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const CONFIG_GROUPS = [
  {
    title: "De-duplication",
    description: "Duplicate detection windows",
    keys: ["dedup_flat_window_days", "dedup_phone_window_days"],
  },
  {
    title: "Incentive Thresholds — Lead Submitter",
    description: "Lead submission milestone thresholds",
    keys: [
      "incentive_lead_submitter_bronze",
      "incentive_lead_submitter_silver",
      "incentive_lead_submitter_gold",
      "incentive_lead_submitter_platinum",
    ],
  },
  {
    title: "Incentive Thresholds — Visit Handler",
    description: "Visit completion milestone thresholds",
    keys: [
      "incentive_visit_handler_bronze",
      "incentive_visit_handler_silver",
      "incentive_visit_handler_gold",
      "incentive_visit_handler_platinum",
    ],
  },
  {
    title: "Incentive Thresholds — Quality Champion",
    description: "Quality score thresholds and minimums",
    keys: [
      "incentive_quality_champion_bronze",
      "incentive_quality_champion_silver",
      "incentive_quality_champion_gold",
      "incentive_quality_champion_platinum",
      "incentive_quality_champion_min_leads",
    ],
  },
  {
    title: "Quality Configuration",
    description: "Quality scoring weights and minimum score for incentives",
    keys: ["quality_score_weights", "min_quality_score_for_incentives"],
  },
  {
    title: "Contact Info",
    description: "Platform contact details",
    keys: ["demorentals_contact_phone", "demorentals_whatsapp_phone"],
  },
];

const PHONE_KEYS: ReadonlySet<string> = new Set([
  "demorentals_contact_phone",
  "demorentals_whatsapp_phone",
]);
const JSON_KEYS: ReadonlySet<string> = new Set([SYSTEM_CONFIG_KEYS.QUALITY_SCORE_WEIGHTS]);
const RATE_LIMIT_DEFAULT = 5;

const rateLimitSchema = z.object({
  daily_lead_limit: z
    .number()
    .int("Daily lead limit must be a whole number")
    .min(1, "Daily lead limit must be at least 1")
    .max(50, "Daily lead limit cannot exceed 50"),
});

type RateLimitValues = z.infer<typeof rateLimitSchema>;

function formatKeyLabel(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseConfigValue(value: string): string {
  try {
    const parsed = JSON.parse(value);

    if (typeof parsed === "object" && parsed !== null) {
      return JSON.stringify(parsed);
    }

    return String(parsed);
  } catch {
    return value;
  }
}

function parseConfigNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);

    if (typeof parsed !== "number" || Number.isNaN(parsed)) {
      return fallback;
    }

    return parsed;
  } catch {
    return fallback;
  }
}

export default function SettingsPage() {
  const configEntries = useQuery(api.systemConfig.getAll);
  const guardLeadLimitConfig = useQuery(api.systemConfig.get, {
    key: SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY,
  });
  const setConfig = useMutation(api.systemConfig.set);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingRateLimit, setIsSavingRateLimit] = useState(false);

  const rateLimitForm = useForm<RateLimitValues>({
    resolver: zodResolver(rateLimitSchema),
    defaultValues: {
      daily_lead_limit: RATE_LIMIT_DEFAULT,
    },
  });

  useEffect(() => {
    if (guardLeadLimitConfig === undefined) {
      return;
    }

    rateLimitForm.reset({
      daily_lead_limit: parseConfigNumber(guardLeadLimitConfig?.value, RATE_LIMIT_DEFAULT),
    });
  }, [guardLeadLimitConfig, rateLimitForm]);

  function startEditing(key: string, currentValue: string) {
    setEditingKey(key);
    setEditValue(parseConfigValue(currentValue));
  }

  function cancelEditing() {
    setEditingKey(null);
    setEditValue("");
  }

  async function handleSave(key: string) {
    try {
      setIsSaving(true);

      let serialized: string;
      if (PHONE_KEYS.has(key)) {
        serialized = JSON.stringify(editValue);
      } else if (JSON_KEYS.has(key)) {
        const parsed = JSON.parse(editValue);
        serialized = JSON.stringify(parsed);
      } else {
        serialized = JSON.stringify(Number(editValue));
      }

      await setConfig({ key, value: serialized });
      toast.success("Config updated");
      setEditingKey(null);
      setEditValue("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update config";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function onSaveRateLimit(values: RateLimitValues) {
    try {
      setIsSavingRateLimit(true);
      await setConfig({
        key: SYSTEM_CONFIG_KEYS.MAX_LEADS_PER_GUARD_PER_DAY,
        value: JSON.stringify(values.daily_lead_limit),
      });
      toast.success("Daily lead limit updated");
      rateLimitForm.reset(values);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update daily lead limit";
      toast.error(message);
    } finally {
      setIsSavingRateLimit(false);
    }
  }

  if (configEntries === undefined || guardLeadLimitConfig === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  const configMap = new Map(configEntries.map((entry) => [entry.key, entry]));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">System Settings</h2>
        <p className="text-sm text-slate-600">
          Configure rate limits, de-duplication windows, rollout flags, incentive thresholds, and
          contact info.
        </p>
      </div>

      <OpsFieldWorkerRolloutCard />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Rate Limits</CardTitle>
          <CardDescription className="text-sm text-slate-600">
            Configure guard lead submission limits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...rateLimitForm}>
            <form
              className="flex flex-col gap-4 sm:flex-row sm:items-end"
              onSubmit={rateLimitForm.handleSubmit(onSaveRateLimit)}
            >
              <FormField
                control={rateLimitForm.control}
                name="daily_lead_limit"
                render={({ field }) => (
                  <FormItem className="w-full sm:max-w-xs">
                    <FormLabel>Daily Lead Limit per Guard</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        step={1}
                        value={field.value}
                        onChange={(event) => {
                          field.onChange(Number(event.target.value));
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum number of leads a guard can submit per day. Resets at midnight IST.
                      Changes take effect immediately.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={isSavingRateLimit || !rateLimitForm.formState.isDirty}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {isSavingRateLimit ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="size-4" />
                    Save
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {configEntries.length === 0 ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="py-12 text-center">
            <Settings className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="text-sm text-slate-500">
              No configuration entries found. Run the seed script first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {CONFIG_GROUPS.map((group) => {
            const groupEntries = group.keys
              .map((key) => {
                const entry = configMap.get(key);
                return entry ? { key, entry } : null;
              })
              .filter(
                (item): item is { key: string; entry: (typeof configEntries)[number] } =>
                  item !== null,
              );

            if (groupEntries.length === 0) return null;

            return (
              <Card key={group.title} className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-900">{group.title}</CardTitle>
                  <CardDescription className="text-sm text-slate-600">
                    {group.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-0">
                    {groupEntries.map(({ key, entry }, index) => (
                      <div key={key}>
                        {index > 0 && <Separator className="my-3" />}
                        <div className="flex items-center justify-between gap-4 py-1">
                          <Label className="min-w-0 shrink-0 text-sm font-medium text-slate-700">
                            {formatKeyLabel(key)}
                          </Label>

                          {editingKey === key ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type={PHONE_KEYS.has(key) || JSON_KEYS.has(key) ? "text" : "number"}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className={
                                  JSON_KEYS.has(key) ? "h-8 w-80 text-sm" : "h-8 w-40 text-sm"
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    void handleSave(key);
                                  } else if (e.key === "Escape") {
                                    cancelEditing();
                                  }
                                }}
                                autoFocus
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="size-8 p-0 text-green-600 hover:bg-green-50 hover:text-green-700"
                                onClick={() => void handleSave(key)}
                                disabled={isSaving}
                              >
                                {isSaving ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Save className="size-4" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="size-8 p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                onClick={cancelEditing}
                                disabled={isSaving}
                              >
                                <X className="size-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono text-slate-900">
                                {parseConfigValue(entry.value)}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="size-8 p-0 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                onClick={() => startEditing(key, entry.value)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
