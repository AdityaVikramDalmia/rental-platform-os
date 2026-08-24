"use client";

import { useConvex, useQuery } from "convex/react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { formatDateTime } from "../../../../lib/dates";
import { formatINR } from "../../../../lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SimulationTabProps = {
  canRunSimulation: boolean;
};

type ClosureOption = {
  id: Id<"closures">;
  label: string;
  subLabel: string;
};

type ConfigSelectorValue = "ACTIVE" | Id<"incentive_config_versions">;

type SimulationModifier = {
  template_id: Id<"commission_modifier_templates">;
  template_name: string;
  reward_mode: "BPS" | "FLAT_PAISE";
  link_mode: "INDIVIDUAL" | "AND_GROUP" | "OR_GROUP";
  metric_value: number;
  delta_bps: number | undefined;
  delta_paise: number | undefined;
  passed: boolean;
};

type SimulationResult = {
  closure_id: Id<"closures">;
  v3_effective_rate_bps: number;
  v3_pool_paise: number;
  v2_payout_paise: number | undefined;
  delta_paise: number | undefined;
  delta_percent: number | undefined;
  modifier_breakdown: SimulationModifier[];
};

type BatchSimulationResult = {
  items: SimulationResult[];
  aggregate: {
    evaluated_count: number;
    compared_count: number;
    avg_delta_paise: number;
    avg_delta_percent: number;
    max_delta_paise: number;
    min_delta_paise: number;
    v3_greater_count: number;
    v3_lower_count: number;
    v3_equal_count: number;
    v3_greater_percent: number;
    v3_lower_percent: number;
  };
};

const REPORT_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function formatPercent(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value) || !Number.isFinite(value)) {
    return "-";
  }

  return `${value.toFixed(2)}%`;
}

function formatDelta(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }

  if (value === 0) {
    return formatINR(0);
  }

  const abs = Math.abs(value);
  return `${value > 0 ? "+" : "-"}${formatINR(abs)}`;
}

function formatModifierImpact(modifier: {
  reward_mode: "BPS" | "FLAT_PAISE";
  delta_bps: number | undefined;
  delta_paise: number | undefined;
  passed: boolean;
}): string {
  if (!modifier.passed) {
    return "Not applied";
  }

  if (modifier.reward_mode === "BPS") {
    const bps = modifier.delta_bps ?? 0;
    const signed = bps > 0 ? `+${bps}` : `${bps}`;
    return `${signed} bps`;
  }

  const paise = modifier.delta_paise ?? 0;
  return formatDelta(paise);
}

function buildClosureOptions(
  closures:
    | {
        closure_id: Id<"closures">;
        flat_number: string | undefined;
        building_name: string | undefined;
        society_name: string | undefined;
        move_in_date: number;
        v2_payout_paise: number | undefined;
      }[]
    | undefined,
): ClosureOption[] {
  if (!closures) {
    return [];
  }

  return closures.map((closure) => {
    const titleBits = [closure.flat_number, closure.building_name, closure.society_name].filter(
      (value): value is string => Boolean(value && value.trim().length > 0),
    );

    const label = titleBits.length > 0 ? titleBits.join(" - ") : `Closure ${closure.closure_id}`;
    const payoutLabel =
      closure.v2_payout_paise !== undefined ? formatINR(closure.v2_payout_paise) : "No v2 payout";

    return {
      id: closure.closure_id,
      label,
      subLabel: `${formatDateTime(closure.move_in_date)} - v2 ${payoutLabel}`,
    };
  });
}

function ClosurePicker({
  value,
  onChange,
  options,
  disabled,
}: {
  value: Id<"closures"> | null;
  onChange: (value: Id<"closures">) => void;
  options: ClosureOption[];
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selected ? selected.label : "Select closure"}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[480px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by flat, building, or closure id..." />
          <CommandList>
            <CommandEmpty>No closures found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.label} ${option.subLabel} ${option.id}`.toLowerCase()}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 size-4", value === option.id ? "opacity-100" : "opacity-0")}
                  />
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    <span className="text-xs text-slate-500">{option.subLabel}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function SimulationTab({ canRunSimulation }: SimulationTabProps) {
  const convex = useConvex();
  const closures = useQuery(api.commissionEngine.listSimulationClosures, { limit: 120 });
  const versionsPage = useQuery(api.incentiveConfig.list, {
    paginationOpts: { numItems: 200, cursor: null },
  });

  const [selectedClosureId, setSelectedClosureId] = useState<Id<"closures"> | null>(null);
  const [selectedConfigVersion, setSelectedConfigVersion] = useState<ConfigSelectorValue>("ACTIVE");
  const [batchSizeInput, setBatchSizeInput] = useState("20");
  const [isRunningSingle, setIsRunningSingle] = useState(false);
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [singleResult, setSingleResult] = useState<SimulationResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchSimulationResult | null>(null);

  const closureOptions = useMemo(() => buildClosureOptions(closures), [closures]);
  const configVersions = versionsPage?.page ?? [];
  const selectedConfigVersionCode = useMemo(() => {
    if (selectedConfigVersion === "ACTIVE") {
      return undefined;
    }

    return configVersions.find((version) => version._id === selectedConfigVersion)?.version_code;
  }, [configVersions, selectedConfigVersion]);

  const reportWindow = useMemo(() => {
    const dateTo = Date.now();
    return {
      date_from: dateTo - REPORT_WINDOW_DAYS * DAY_MS,
      date_to: dateTo,
    };
  }, []);

  const varianceSummary = useQuery(api.commissionEngine.getVarianceSummary, {
    date_from: reportWindow.date_from,
    date_to: reportWindow.date_to,
    config_version: selectedConfigVersionCode,
  });

  const modifierHitRates = useQuery(api.commissionEngine.getModifierHitRates, {
    date_from: reportWindow.date_from,
    date_to: reportWindow.date_to,
    config_version: selectedConfigVersionCode,
  });

  async function handleRunSingleSimulation() {
    if (!selectedClosureId) {
      toast.error("Select a closure to run simulation");
      return;
    }

    setIsRunningSingle(true);
    try {
      const result = await convex.query(api.commissionEngine.simulateEvaluation, {
        closure_id: selectedClosureId,
        config_version_id: selectedConfigVersion === "ACTIVE" ? undefined : selectedConfigVersion,
      });
      setSingleResult(result);
      toast.success("Simulation completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Simulation failed");
    } finally {
      setIsRunningSingle(false);
    }
  }

  async function handleRunBatchSimulation() {
    const parsedSize = Number(batchSizeInput);
    const batchSize = Number.isFinite(parsedSize) ? Math.floor(parsedSize) : 0;
    const safeBatchSize = Math.max(1, Math.min(100, batchSize));

    if (!closures || closures.length === 0) {
      toast.error("No closures available for batch simulation");
      return;
    }

    setIsRunningBatch(true);
    try {
      const closureIds = closures.slice(0, safeBatchSize).map((closure) => closure.closure_id);
      const result = await convex.query(api.commissionEngine.simulateBatch, {
        closure_ids: closureIds,
        config_version_id: selectedConfigVersion === "ACTIVE" ? undefined : selectedConfigVersion,
      });
      setBatchResult(result);
      toast.success(`Batch simulation completed for ${closureIds.length} closures`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Batch simulation failed");
    } finally {
      setIsRunningBatch(false);
    }
  }

  if (closures === undefined || versionsPage === undefined) {
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
          <CardTitle className="text-lg text-slate-900">Simulation Controls</CardTitle>
          <CardDescription>
            Compare commission v3 outcomes against v2 payouts with ACTIVE or draft configs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Closure Picker
              </p>
              <ClosurePicker
                value={selectedClosureId}
                onChange={setSelectedClosureId}
                options={closureOptions}
                disabled={!canRunSimulation || isRunningSingle}
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Config Version
              </p>
              <Select
                value={selectedConfigVersion}
                onValueChange={(value) => setSelectedConfigVersion(value as ConfigSelectorValue)}
                disabled={!canRunSimulation || isRunningSingle}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select config version" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  {configVersions.map((version) => (
                    <SelectItem key={version._id} value={version._id}>
                      {version.version_code} ({version.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="button"
            disabled={!canRunSimulation || !selectedClosureId || isRunningSingle}
            onClick={handleRunSingleSimulation}
          >
            {isRunningSingle ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Running Simulation...
              </>
            ) : (
              "Run Simulation"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Results Panel</CardTitle>
          <CardDescription>Side-by-side v3 and v2 comparison for selected closure.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!singleResult ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">
              Run a simulation to view v3 vs v2 variance and modifier breakdown.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">v3 Effective Rate</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {(singleResult.v3_effective_rate_bps / 100).toFixed(2)}%
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">v3 Pool</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatINR(singleResult.v3_pool_paise)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">v2 Payout</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {singleResult.v2_payout_paise !== undefined
                      ? formatINR(singleResult.v2_payout_paise)
                      : "-"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Delta (Paise)</p>
                  <p
                    className={cn(
                      "text-lg font-semibold",
                      (singleResult.delta_paise ?? 0) > 0
                        ? "text-emerald-700"
                        : (singleResult.delta_paise ?? 0) < 0
                          ? "text-red-700"
                          : "text-slate-900",
                    )}
                  >
                    {formatDelta(singleResult.delta_paise)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Delta (%)</p>
                  <p
                    className={cn(
                      "text-lg font-semibold",
                      (singleResult.delta_percent ?? 0) > 0
                        ? "text-emerald-700"
                        : (singleResult.delta_percent ?? 0) < 0
                          ? "text-red-700"
                          : "text-slate-900",
                    )}
                  >
                    {formatPercent(singleResult.delta_percent)}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-3 py-2.5 font-medium">Modifier</th>
                      <th className="px-3 py-2.5 font-medium">Reward Mode</th>
                      <th className="px-3 py-2.5 font-medium">Link Mode</th>
                      <th className="px-3 py-2.5 font-medium">Metric Value</th>
                      <th className="px-3 py-2.5 font-medium">Impact</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {singleResult.modifier_breakdown.map((modifier) => (
                      <tr
                        key={`${modifier.template_id}-${modifier.metric_value}-${modifier.template_name}`}
                        className="border-b border-slate-100 text-slate-700"
                      >
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {modifier.template_name}
                        </td>
                        <td className="px-3 py-2.5">{modifier.reward_mode}</td>
                        <td className="px-3 py-2.5">{modifier.link_mode}</td>
                        <td className="px-3 py-2.5">{modifier.metric_value.toFixed(2)}</td>
                        <td className="px-3 py-2.5">{formatModifierImpact(modifier)}</td>
                        <td className="px-3 py-2.5">
                          <Badge
                            className={
                              modifier.passed
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-200 text-slate-700"
                            }
                          >
                            {modifier.passed ? "Passed" : "Failed"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Batch Summary</CardTitle>
          <CardDescription>
            Run simulation on latest N confirmed closures and inspect aggregate variance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-28 space-y-1">
              <p className="text-xs text-slate-500">Last N Closures</p>
              <Input
                inputMode="numeric"
                value={batchSizeInput}
                onChange={(event) => setBatchSizeInput(event.target.value)}
                disabled={!canRunSimulation || isRunningBatch}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleRunBatchSimulation}
              disabled={!canRunSimulation || isRunningBatch}
            >
              {isRunningBatch ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Running Batch...
                </>
              ) : (
                "Run Batch Simulation"
              )}
            </Button>
          </div>

          {!batchResult ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              No batch run yet.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Compared</p>
                <p className="text-lg font-semibold text-slate-900">
                  {batchResult.aggregate.compared_count}/{batchResult.aggregate.evaluated_count}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Avg Delta</p>
                <p className="text-lg font-semibold text-slate-900">
                  {formatDelta(batchResult.aggregate.avg_delta_paise)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Max Delta</p>
                <p className="text-lg font-semibold text-emerald-700">
                  {formatDelta(batchResult.aggregate.max_delta_paise)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Min Delta</p>
                <p className="text-lg font-semibold text-red-700">
                  {formatDelta(batchResult.aggregate.min_delta_paise)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">v3 &gt; v2</p>
                <p className="text-lg font-semibold text-emerald-700">
                  {formatPercent(batchResult.aggregate.v3_greater_percent)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">v3 &lt; v2</p>
                <p className="text-lg font-semibold text-red-700">
                  {formatPercent(batchResult.aggregate.v3_lower_percent)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Variance Summary (Last 90 Days)</CardTitle>
          <CardDescription>
            Aggregate v3 vs v2 variance from persisted commission evaluations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {varianceSummary === undefined ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading variance summary...
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Avg v3 Pool</p>
                <p className="text-lg font-semibold text-slate-900">
                  {formatINR(varianceSummary.avg_v3_pool_paise)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Avg v2 Payout</p>
                <p className="text-lg font-semibold text-slate-900">
                  {formatINR(varianceSummary.avg_v2_payout_paise)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Avg Delta</p>
                <p className="text-lg font-semibold text-slate-900">
                  {formatDelta(varianceSummary.avg_delta_paise)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">v3 &gt; v2 Cases</p>
                <p className="text-lg font-semibold text-emerald-700">
                  {varianceSummary.v3_greater_count}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">v3 &lt; v2 Cases</p>
                <p className="text-lg font-semibold text-red-700">
                  {varianceSummary.v3_lower_count}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Modifier Hit Rate Table</CardTitle>
          <CardDescription>
            Pass-rate and average impact by modifier template over last 90 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {modifierHitRates === undefined ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading modifier hit rates...
            </div>
          ) : modifierHitRates.templates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              No modifier history available for this filter window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-2.5 font-medium">Modifier</th>
                    <th className="px-3 py-2.5 font-medium">Reward Mode</th>
                    <th className="px-3 py-2.5 font-medium">Pass Rate</th>
                    <th className="px-3 py-2.5 font-medium">Avg Impact</th>
                    <th className="px-3 py-2.5 font-medium">Passed / Total</th>
                  </tr>
                </thead>
                <tbody>
                  {modifierHitRates.templates.map((template) => (
                    <tr
                      key={template.template_id}
                      className="border-b border-slate-100 text-slate-700"
                    >
                      <td className="px-3 py-2.5 font-medium text-slate-900">
                        {template.template_name}
                      </td>
                      <td className="px-3 py-2.5">{template.reward_mode}</td>
                      <td className="px-3 py-2.5">{formatPercent(template.pass_rate_percent)}</td>
                      <td className="px-3 py-2.5">
                        {template.reward_mode === "BPS"
                          ? `${template.avg_delta_bps?.toFixed(2) ?? "-"} bps`
                          : template.avg_delta_paise !== undefined
                            ? formatINR(template.avg_delta_paise)
                            : "-"}
                      </td>
                      <td className="px-3 py-2.5">
                        {template.passed_count} / {template.total_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
