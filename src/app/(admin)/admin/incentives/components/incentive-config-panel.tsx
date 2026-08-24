"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import { SYSTEM_CONFIG_KEYS } from "../../../../../../lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

type IncentiveConfigPanelProps = {
  canManage: boolean;
};

const positiveNumberString = z
  .string()
  .trim()
  .min(1, "Must be a positive number")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
    message: "Must be a positive number",
  });

const percentString = positiveNumberString.refine((value) => Number(value) <= 100, {
  message: "Percentage must be between 0 and 100",
});

function numeric(value: string): number {
  return Number(value);
}

const leadVisitSchema = z
  .object({
    bronze: positiveNumberString,
    silver: positiveNumberString,
    gold: positiveNumberString,
    platinum: positiveNumberString,
  })
  .refine((values) => numeric(values.bronze) < numeric(values.silver), {
    message: "Thresholds must be ascending (Bronze < Silver < Gold < Platinum)",
    path: ["silver"],
  })
  .refine((values) => numeric(values.silver) < numeric(values.gold), {
    message: "Thresholds must be ascending (Bronze < Silver < Gold < Platinum)",
    path: ["gold"],
  })
  .refine((values) => numeric(values.gold) < numeric(values.platinum), {
    message: "Thresholds must be ascending (Bronze < Silver < Gold < Platinum)",
    path: ["platinum"],
  });

const qualitySchema = z
  .object({
    bronze: percentString,
    silver: percentString,
    gold: percentString,
    platinum: percentString,
    min_leads: positiveNumberString,
  })
  .refine((values) => numeric(values.bronze) < numeric(values.silver), {
    message: "Thresholds must be ascending (Bronze < Silver < Gold < Platinum)",
    path: ["silver"],
  })
  .refine((values) => numeric(values.silver) < numeric(values.gold), {
    message: "Thresholds must be ascending (Bronze < Silver < Gold < Platinum)",
    path: ["gold"],
  })
  .refine((values) => numeric(values.gold) < numeric(values.platinum), {
    message: "Thresholds must be ascending (Bronze < Silver < Gold < Platinum)",
    path: ["platinum"],
  });

type LeadVisitValues = z.infer<typeof leadVisitSchema>;
type QualityValues = z.infer<typeof qualitySchema>;

function parseNumericConfig(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "number" && Number.isFinite(parsed)) {
      return parsed;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function IncentiveConfigPanel({ canManage }: IncentiveConfigPanelProps) {
  const configEntries = useQuery(api.systemConfig.getAll);
  const setConfig = useMutation(api.systemConfig.set);

  const [isSavingLead, setIsSavingLead] = useState(false);
  const [isSavingVisit, setIsSavingVisit] = useState(false);
  const [isSavingQuality, setIsSavingQuality] = useState(false);

  const configMap = useMemo(
    () => new Map((configEntries ?? []).map((entry) => [entry.key, entry.value])),
    [configEntries],
  );

  const leadDefaults = useMemo(
    () => ({
      bronze: String(
        parseNumericConfig(configMap.get(SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_BRONZE), 10),
      ),
      silver: String(
        parseNumericConfig(configMap.get(SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_SILVER), 25),
      ),
      gold: String(
        parseNumericConfig(configMap.get(SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_GOLD), 50),
      ),
      platinum: String(
        parseNumericConfig(
          configMap.get(SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_PLATINUM),
          100,
        ),
      ),
    }),
    [configMap],
  );

  const visitDefaults = useMemo(
    () => ({
      bronze: String(
        parseNumericConfig(configMap.get(SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_BRONZE), 10),
      ),
      silver: String(
        parseNumericConfig(configMap.get(SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_SILVER), 25),
      ),
      gold: String(
        parseNumericConfig(configMap.get(SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_GOLD), 50),
      ),
      platinum: String(
        parseNumericConfig(configMap.get(SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_PLATINUM), 100),
      ),
    }),
    [configMap],
  );

  const qualityDefaults = useMemo(
    () => ({
      bronze: String(
        parseNumericConfig(configMap.get(SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_BRONZE), 70),
      ),
      silver: String(
        parseNumericConfig(configMap.get(SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_SILVER), 80),
      ),
      gold: String(
        parseNumericConfig(configMap.get(SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_GOLD), 90),
      ),
      platinum: String(
        parseNumericConfig(
          configMap.get(SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_PLATINUM),
          95,
        ),
      ),
      min_leads: String(
        parseNumericConfig(
          configMap.get(SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_MIN_LEADS),
          10,
        ),
      ),
    }),
    [configMap],
  );

  const leadForm = useForm<LeadVisitValues>({
    resolver: zodResolver(leadVisitSchema),
    defaultValues: leadDefaults,
  });

  const visitForm = useForm<LeadVisitValues>({
    resolver: zodResolver(leadVisitSchema),
    defaultValues: visitDefaults,
  });

  const qualityForm = useForm<QualityValues>({
    resolver: zodResolver(qualitySchema),
    defaultValues: qualityDefaults,
  });

  useEffect(() => {
    leadForm.reset(leadDefaults);
  }, [leadDefaults, leadForm]);

  useEffect(() => {
    visitForm.reset(visitDefaults);
  }, [visitDefaults, visitForm]);

  useEffect(() => {
    qualityForm.reset(qualityDefaults);
  }, [qualityDefaults, qualityForm]);

  async function saveChangedValues(updates: Array<{ key: string; value: number }>) {
    if (updates.length === 0) {
      toast.success("Thresholds updated!");
      return;
    }

    await Promise.all(
      updates.map(({ key, value }) =>
        setConfig({
          key,
          value: JSON.stringify(Number(value)),
        }),
      ),
    );

    toast.success("Thresholds updated!");
  }

  async function onSaveLead(values: LeadVisitValues) {
    setIsSavingLead(true);
    try {
      await saveChangedValues(
        [
          {
            key: SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_BRONZE,
            value: numeric(values.bronze),
          },
          {
            key: SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_SILVER,
            value: numeric(values.silver),
          },
          {
            key: SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_GOLD,
            value: numeric(values.gold),
          },
          {
            key: SYSTEM_CONFIG_KEYS.INCENTIVE_LEAD_SUBMITTER_PLATINUM,
            value: numeric(values.platinum),
          },
        ].filter(({ key, value }) => parseNumericConfig(configMap.get(key), value) !== value),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update thresholds");
    } finally {
      setIsSavingLead(false);
    }
  }

  async function onSaveVisit(values: LeadVisitValues) {
    setIsSavingVisit(true);
    try {
      await saveChangedValues(
        [
          {
            key: SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_BRONZE,
            value: numeric(values.bronze),
          },
          {
            key: SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_SILVER,
            value: numeric(values.silver),
          },
          {
            key: SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_GOLD,
            value: numeric(values.gold),
          },
          {
            key: SYSTEM_CONFIG_KEYS.INCENTIVE_VISIT_HANDLER_PLATINUM,
            value: numeric(values.platinum),
          },
        ].filter(({ key, value }) => parseNumericConfig(configMap.get(key), value) !== value),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update thresholds");
    } finally {
      setIsSavingVisit(false);
    }
  }

  async function onSaveQuality(values: QualityValues) {
    setIsSavingQuality(true);
    try {
      await saveChangedValues(
        [
          {
            key: SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_BRONZE,
            value: numeric(values.bronze),
          },
          {
            key: SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_SILVER,
            value: numeric(values.silver),
          },
          {
            key: SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_GOLD,
            value: numeric(values.gold),
          },
          {
            key: SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_PLATINUM,
            value: numeric(values.platinum),
          },
          {
            key: SYSTEM_CONFIG_KEYS.INCENTIVE_QUALITY_CHAMPION_MIN_LEADS,
            value: numeric(values.min_leads),
          },
        ].filter(({ key, value }) => parseNumericConfig(configMap.get(key), value) !== value),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update thresholds");
    } finally {
      setIsSavingQuality(false);
    }
  }

  if (configEntries === undefined) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="py-10 text-center text-sm text-slate-600">
          You don&apos;t have permission to manage thresholds
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Lead Milestone</CardTitle>
          <CardDescription>Verified leads needed per tier.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...leadForm}>
            <form onSubmit={leadForm.handleSubmit(onSaveLead)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FormField
                  control={leadForm.control}
                  name="bronze"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bronze</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={leadForm.control}
                  name="silver"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Silver</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={leadForm.control}
                  name="gold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gold</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={leadForm.control}
                  name="platinum"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Platinum</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isSavingLead}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  {isSavingLead ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Visit Milestone</CardTitle>
          <CardDescription>Completed visits needed per tier.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...visitForm}>
            <form onSubmit={visitForm.handleSubmit(onSaveVisit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FormField
                  control={visitForm.control}
                  name="bronze"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bronze</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={visitForm.control}
                  name="silver"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Silver</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={visitForm.control}
                  name="gold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gold</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={visitForm.control}
                  name="platinum"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Platinum</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" step="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isSavingVisit}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  {isSavingVisit ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Quality Streak</CardTitle>
          <CardDescription>
            Verification rate percentage thresholds and minimum leads.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...qualityForm}>
            <form onSubmit={qualityForm.handleSubmit(onSaveQuality)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FormField
                  control={qualityForm.control}
                  name="bronze"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bronze (%)</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" max="100" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={qualityForm.control}
                  name="silver"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Silver (%)</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" max="100" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={qualityForm.control}
                  name="gold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gold (%)</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" max="100" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={qualityForm.control}
                  name="platinum"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Platinum (%)</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" max="100" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={qualityForm.control}
                name="min_leads"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum leads before quality rate applies</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" step="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isSavingQuality}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  {isSavingQuality ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
