"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import {
  ATTRIBUTION_STAGE_WEIGHTS,
  CONFIG_VERSION_STATUS,
  CONTRIBUTION_STAGE,
} from "../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type ConfigVersion = Doc<"incentive_config_versions">;

const STAGES = [
  {
    key: CONTRIBUTION_STAGE.DISCOVERY,
    label: "Discovery",
    description: "Lead submission & sourcing",
  },
  {
    key: CONTRIBUTION_STAGE.VERIFICATION,
    label: "Verification",
    description: "Owner contact & verification",
  },
  { key: CONTRIBUTION_STAGE.CLOSURE, label: "Closure", description: "Deal negotiation & signing" },
  { key: CONTRIBUTION_STAGE.SUPPORT, label: "Support", description: "Post-deal coordination" },
] as const;

type StageWeightValues = {
  DISCOVERY: number;
  VERIFICATION: number;
  CLOSURE: number;
  SUPPORT: number;
};

type AttributionConfig = {
  stage_weights: StageWeightValues;
  quality_adjustment_enabled: boolean;
  min_quality_threshold: number;
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

function parseAttributionConfig(version: ConfigVersion | null | undefined): {
  config: AttributionConfig;
  raw: Record<string, unknown>;
} {
  const defaultConfig: AttributionConfig = {
    stage_weights: {
      DISCOVERY: ATTRIBUTION_STAGE_WEIGHTS.DISCOVERY,
      VERIFICATION: ATTRIBUTION_STAGE_WEIGHTS.VERIFICATION,
      CLOSURE: ATTRIBUTION_STAGE_WEIGHTS.CLOSURE,
      SUPPORT: ATTRIBUTION_STAGE_WEIGHTS.SUPPORT,
    },
    quality_adjustment_enabled: true,
    min_quality_threshold: 30,
  };

  if (!version) {
    return { config: defaultConfig, raw: {} };
  }

  const raw = parseJsonObject(version.config_json);
  const attributionRaw =
    typeof raw.attribution === "object" &&
    raw.attribution !== null &&
    !Array.isArray(raw.attribution)
      ? (raw.attribution as Record<string, unknown>)
      : {};

  const weightsRaw =
    typeof attributionRaw.stage_weights === "object" &&
    attributionRaw.stage_weights !== null &&
    !Array.isArray(attributionRaw.stage_weights)
      ? (attributionRaw.stage_weights as Record<string, unknown>)
      : {};

  function safeNumber(val: unknown, fallback: number): number {
    if (typeof val === "number" && Number.isFinite(val) && val >= 0 && val <= 100) {
      return val;
    }
    return fallback;
  }

  return {
    config: {
      stage_weights: {
        DISCOVERY: safeNumber(weightsRaw.DISCOVERY, defaultConfig.stage_weights.DISCOVERY),
        VERIFICATION: safeNumber(weightsRaw.VERIFICATION, defaultConfig.stage_weights.VERIFICATION),
        CLOSURE: safeNumber(weightsRaw.CLOSURE, defaultConfig.stage_weights.CLOSURE),
        SUPPORT: safeNumber(weightsRaw.SUPPORT, defaultConfig.stage_weights.SUPPORT),
      },
      quality_adjustment_enabled:
        typeof attributionRaw.quality_adjustment_enabled === "boolean"
          ? attributionRaw.quality_adjustment_enabled
          : defaultConfig.quality_adjustment_enabled,
      min_quality_threshold: safeNumber(
        attributionRaw.min_quality_threshold,
        defaultConfig.min_quality_threshold,
      ),
    },
    raw,
  };
}

type AttributionTabProps = {
  canConfigure: boolean;
};

export function AttributionTab({ canConfigure }: AttributionTabProps) {
  const versionsPage = useQuery(api.incentiveConfig.list, {
    paginationOpts: { numItems: 200, cursor: null },
  });
  const activeConfig = useQuery(api.incentiveConfig.getActive);
  const updateDraft = useMutation(api.incentiveConfig.updateDraft);

  const [isSaving, setIsSaving] = useState(false);

  const versions = versionsPage?.page ?? [];
  const latestDraft = useMemo(
    () => versions.find((v) => v.status === CONFIG_VERSION_STATUS.DRAFT) ?? null,
    [versions],
  );

  const { config: draftConfig, raw: draftRaw } = useMemo(
    () => parseAttributionConfig(latestDraft),
    [latestDraft],
  );
  const activeParsed = useMemo(() => parseAttributionConfig(activeConfig), [activeConfig]);

  const [weights, setWeights] = useState<StageWeightValues>(draftConfig.stage_weights);
  const [qualityEnabled, setQualityEnabled] = useState(draftConfig.quality_adjustment_enabled);
  const [minThreshold, setMinThreshold] = useState(String(draftConfig.min_quality_threshold));

  useEffect(() => {
    setWeights(draftConfig.stage_weights);
    setQualityEnabled(draftConfig.quality_adjustment_enabled);
    setMinThreshold(String(draftConfig.min_quality_threshold));
  }, [draftConfig]);

  const weightSum = weights.DISCOVERY + weights.VERIFICATION + weights.CLOSURE + weights.SUPPORT;
  const isValidSum = weightSum === 100;

  function handleWeightChange(stage: keyof StageWeightValues, value: string) {
    const parsed = value === "" ? 0 : Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) return;
    setWeights((prev) => ({ ...prev, [stage]: parsed }));
  }

  async function handleSave() {
    if (!latestDraft) {
      toast.error("Create a draft config version in Program tab first.");
      return;
    }

    if (!isValidSum) {
      toast.error("Stage weights must sum to exactly 100%.");
      return;
    }

    const thresholdNum = Number.parseInt(minThreshold, 10);
    if (Number.isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 100) {
      toast.error("Min quality threshold must be 0–100.");
      return;
    }

    setIsSaving(true);
    try {
      const nextConfig: Record<string, unknown> = {
        ...draftRaw,
        attribution: {
          stage_weights: weights,
          quality_adjustment_enabled: qualityEnabled,
          min_quality_threshold: thresholdNum,
        },
      };

      await updateDraft({
        id: latestDraft._id,
        config_json: JSON.stringify(nextConfig),
      });

      toast.success(`Attribution config saved to draft ${latestDraft.version_code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save attribution config");
    } finally {
      setIsSaving(false);
    }
  }

  if (versionsPage === undefined) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg text-slate-900">Stage Weights</CardTitle>
              <CardDescription>
                How the incentive pool is distributed across deal stages. Must total 100%.
              </CardDescription>
            </div>
            {latestDraft ? (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                Draft: {latestDraft.version_code}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-slate-300 text-slate-500">
                No draft
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {STAGES.map((stage) => (
              <div key={stage.key} className="space-y-1.5">
                <Label
                  htmlFor={`weight-${stage.key}`}
                  className="text-sm font-medium text-slate-700"
                >
                  {stage.label}
                </Label>
                <p className="text-xs text-slate-500">{stage.description}</p>
                <div className="relative">
                  <Input
                    id={`weight-${stage.key}`}
                    type="number"
                    min={0}
                    max={100}
                    value={weights[stage.key]}
                    onChange={(e) => handleWeightChange(stage.key, e.target.value)}
                    disabled={!canConfigure || !latestDraft || isSaving}
                    className="pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                    %
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <span className="text-sm font-medium text-slate-700">Total</span>
            <span
              className={`text-lg font-semibold tabular-nums ${
                isValidSum ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {weightSum}%
            </span>
          </div>
          {!isValidSum && (
            <p className="text-sm font-medium text-red-600">
              Weights must sum to exactly 100%. Currently {weightSum > 100 ? "over" : "under"} by{" "}
              {Math.abs(100 - weightSum)}%.
            </p>
          )}

          {activeConfig && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                Active Config
              </p>
              <div className="flex flex-wrap gap-3">
                {STAGES.map((stage) => (
                  <span key={stage.key} className="text-xs text-slate-600">
                    {stage.label}:{" "}
                    <span className="font-medium">
                      {activeParsed.config.stage_weights[stage.key]}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Quality Adjustment</CardTitle>
          <CardDescription>Scale attribution splits by contributor quality scores.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium text-slate-700">Enable Quality Weighting</Label>
              <p className="text-xs text-slate-500">
                Multiply contribution units by quality score before splitting
              </p>
            </div>
            <Switch
              checked={qualityEnabled}
              onCheckedChange={setQualityEnabled}
              disabled={!canConfigure || !latestDraft || isSaving}
            />
          </div>

          {qualityEnabled && (
            <div className="space-y-1.5">
              <Label htmlFor="min-quality" className="text-sm font-medium text-slate-700">
                Minimum Quality Threshold
              </Label>
              <p className="text-xs text-slate-500">
                Contributors below this score are excluded from attribution splits
              </p>
              <Input
                id="min-quality"
                type="number"
                min={0}
                max={100}
                value={minThreshold}
                onChange={(e) => setMinThreshold(e.target.value)}
                disabled={!canConfigure || !latestDraft || isSaving}
                className="max-w-[120px]"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!canConfigure || !latestDraft || isSaving || !isValidSum}
        >
          {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
          Save Attribution Config
        </Button>
      </div>
    </div>
  );
}
