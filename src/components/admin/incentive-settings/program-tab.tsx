"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { CONFIG_VERSION_STATUS, SYSTEM_CONFIG_KEYS } from "../../../../lib/constants";
import { formatDateTime } from "../../../../lib/dates";
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
type RolloutMode = "OFF" | "SHADOW" | "PARTIAL" | "FULL";
type FeatureFlagKey =
  | "shadow_mode"
  | "split_preview_enabled"
  | "gamification_enabled"
  | "disbursement_enabled";

const ROLLOUT_MODES: readonly RolloutMode[] = ["OFF", "SHADOW", "PARTIAL", "FULL"];

const configVersionSchema = z.object({
  version_code: z.string().trim().min(1, "Version code is required"),
  description: z.string().optional(),
  config_json: z
    .string()
    .trim()
    .min(1, "Config JSON is required")
    .refine(
      (value) => {
        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Config JSON must be valid JSON" },
    ),
});

type ConfigVersionFormValues = z.infer<typeof configVersionSchema>;

type ProgramTabProps = {
  canConfigure: boolean;
  canResolveUserNames: boolean;
};

type ParsedFeatureFlags = {
  shadow_mode: boolean;
  split_preview_enabled: boolean;
  gamification_enabled: boolean;
  disbursement_enabled: boolean;
  raw: Record<string, unknown>;
};

type ParsedRolloutPolicy = {
  mode: RolloutMode;
  raw: Record<string, unknown>;
};

function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value) as unknown, null, 2);
  } catch {
    return value;
  }
}

function parseFeatureFlags(value: string | undefined): ParsedFeatureFlags {
  if (!value) {
    return {
      shadow_mode: false,
      split_preview_enabled: false,
      gamification_enabled: false,
      disbursement_enabled: false,
      raw: {},
    };
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        shadow_mode: false,
        split_preview_enabled: false,
        gamification_enabled: false,
        disbursement_enabled: false,
        raw: {},
      };
    }

    const raw = parsed as Record<string, unknown>;
    return {
      shadow_mode: typeof raw.shadow_mode === "boolean" ? raw.shadow_mode : false,
      split_preview_enabled:
        typeof raw.split_preview_enabled === "boolean" ? raw.split_preview_enabled : false,
      gamification_enabled:
        typeof raw.gamification_enabled === "boolean" ? raw.gamification_enabled : false,
      disbursement_enabled:
        typeof raw.disbursement_enabled === "boolean" ? raw.disbursement_enabled : false,
      raw,
    };
  } catch {
    return {
      shadow_mode: false,
      split_preview_enabled: false,
      gamification_enabled: false,
      disbursement_enabled: false,
      raw: {},
    };
  }
}

function parseRolloutPolicy(value: string | undefined): ParsedRolloutPolicy {
  if (!value) {
    return { mode: "OFF", raw: {} };
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (typeof parsed === "string" && ROLLOUT_MODES.includes(parsed as RolloutMode)) {
      return { mode: parsed as RolloutMode, raw: { mode: parsed } };
    }

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const raw = parsed as Record<string, unknown>;
      const maybeMode = raw.mode;
      if (typeof maybeMode === "string" && ROLLOUT_MODES.includes(maybeMode as RolloutMode)) {
        return { mode: maybeMode as RolloutMode, raw };
      }

      return { mode: "OFF", raw };
    }

    return { mode: "OFF", raw: {} };
  } catch {
    return { mode: "OFF", raw: {} };
  }
}

function statusBadgeClass(status: ConfigVersion["status"]): string {
  if (status === CONFIG_VERSION_STATUS.ACTIVE) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === CONFIG_VERSION_STATUS.DRAFT) {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-slate-100 text-slate-600";
}

function UserLabel({
  userId,
  canResolveUserNames,
}: {
  userId: Id<"users"> | undefined;
  canResolveUserNames: boolean;
}) {
  const user = useQuery(api.users.getById, canResolveUserNames && userId ? { id: userId } : "skip");

  if (!userId) {
    return <span className="text-slate-500">-</span>;
  }

  if (!canResolveUserNames) {
    return <span className="font-mono text-xs text-slate-600">{userId}</span>;
  }

  if (user === undefined) {
    return <span className="text-slate-500">Loading...</span>;
  }

  if (!user) {
    return <span className="font-mono text-xs text-slate-600">{userId}</span>;
  }

  if (user.email) {
    return (
      <span>
        {user.name} ({user.email})
      </span>
    );
  }

  return <span>{user.name}</span>;
}

export function ProgramTab({ canConfigure, canResolveUserNames }: ProgramTabProps) {
  const activeVersion = useQuery(api.incentiveConfig.getActive);
  const versionsPage = useQuery(api.incentiveConfig.list, {
    paginationOpts: { numItems: 200, cursor: null },
  });
  const featureFlagsConfig = useQuery(api.systemConfig.get, {
    key: SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS,
  });
  const rolloutPolicyConfig = useQuery(api.systemConfig.get, {
    key: SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ROLLOUT_POLICY,
  });

  const createDraft = useMutation(api.incentiveConfig.createDraft);
  const updateDraft = useMutation(api.incentiveConfig.updateDraft);
  const activateVersion = useMutation(api.incentiveConfig.activate);
  const archiveVersion = useMutation(api.incentiveConfig.archive);
  const setSystemConfig = useMutation(api.systemConfig.set);
  // TODO: Replace with api.shadowRollout.updateRolloutPolicy once backend mutation is available
  // const updateRolloutPolicy = useMutation(api.shadowRollout.updateRolloutPolicy);

  const [editingVersion, setEditingVersion] = useState<ConfigVersion | null>(null);
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
  const [activateTarget, setActivateTarget] = useState<ConfigVersion | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ConfigVersion | null>(null);
  const [isSubmittingVersion, setIsSubmittingVersion] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [updatingFeatureKey, setUpdatingFeatureKey] = useState<FeatureFlagKey | null>(null);
  const [isUpdatingRollout, setIsUpdatingRollout] = useState(false);

  const versions = versionsPage?.page ?? [];
  const parsedFeatureFlags = useMemo(
    () => parseFeatureFlags(featureFlagsConfig?.value),
    [featureFlagsConfig?.value],
  );
  const parsedRolloutPolicy = useMemo(
    () => parseRolloutPolicy(rolloutPolicyConfig?.value),
    [rolloutPolicyConfig?.value],
  );

  const form = useForm<ConfigVersionFormValues>({
    resolver: zodResolver(configVersionSchema),
    defaultValues: {
      version_code: "",
      description: "",
      config_json: "{}",
    },
  });

  useEffect(() => {
    if (!isVersionDialogOpen) {
      return;
    }

    form.reset({
      version_code: editingVersion?.version_code ?? "",
      description: editingVersion?.description ?? "",
      config_json: editingVersion ? prettyJson(editingVersion.config_json) : "{}",
    });
  }, [editingVersion, form, isVersionDialogOpen]);

  async function onSubmitVersion(values: ConfigVersionFormValues) {
    setIsSubmittingVersion(true);

    try {
      const payload = {
        version_code: values.version_code.trim(),
        description: values.description?.trim() || undefined,
        config_json: values.config_json,
      };

      if (editingVersion) {
        await updateDraft({
          id: editingVersion._id,
          version_code: payload.version_code,
          description: payload.description,
          config_json: payload.config_json,
        });
        toast.success("Draft version updated");
      } else {
        await createDraft(payload);
        toast.success("Draft version created");
      }

      setIsVersionDialogOpen(false);
      setEditingVersion(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save config version");
    } finally {
      setIsSubmittingVersion(false);
    }
  }

  async function handleActivate() {
    if (!activateTarget) {
      return;
    }

    setIsActivating(true);
    try {
      await activateVersion({ id: activateTarget._id });
      toast.success(`Activated ${activateTarget.version_code}`);
      setActivateTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to activate version");
    } finally {
      setIsActivating(false);
    }
  }

  async function handleArchive() {
    if (!archiveTarget) {
      return;
    }

    setIsArchiving(true);
    try {
      await archiveVersion({ id: archiveTarget._id });
      toast.success(`Archived ${archiveTarget.version_code}`);
      setArchiveTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive version");
    } finally {
      setIsArchiving(false);
    }
  }

  async function handleFeatureToggle(key: FeatureFlagKey, checked: boolean) {
    setUpdatingFeatureKey(key);

    try {
      const nextFlags: Record<string, unknown> = {
        ...parsedFeatureFlags.raw,
        shadow_mode: parsedFeatureFlags.shadow_mode,
        split_preview_enabled: parsedFeatureFlags.split_preview_enabled,
        gamification_enabled: parsedFeatureFlags.gamification_enabled,
        disbursement_enabled: parsedFeatureFlags.disbursement_enabled,
      };
      nextFlags[key] = checked;

      await setSystemConfig({
        key: SYSTEM_CONFIG_KEYS.INCENTIVE_V3_FEATURE_FLAGS,
        value: JSON.stringify(nextFlags),
      });
      toast.success("Feature flags updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update feature flags");
    } finally {
      setUpdatingFeatureKey(null);
    }
  }

  async function handleRolloutModeChange(nextMode: RolloutMode) {
    setIsUpdatingRollout(true);

    try {
      const nextPolicy: Record<string, unknown> = {
        ...parsedRolloutPolicy.raw,
        mode: nextMode,
      };

      // TODO: Replace with api.shadowRollout.updateRolloutPolicy once backend mutation is available
      // This should validate rollout transitions and decommission readiness before persisting
      await setSystemConfig({
        key: SYSTEM_CONFIG_KEYS.INCENTIVE_V3_ROLLOUT_POLICY,
        value: JSON.stringify(nextPolicy),
      });
      toast.success("Rollout policy updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update rollout policy");
    } finally {
      setIsUpdatingRollout(false);
    }
  }

  if (
    versionsPage === undefined ||
    featureFlagsConfig === undefined ||
    rolloutPolicyConfig === undefined
  ) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg text-slate-900">Active Config Version</CardTitle>
            <CardDescription>Current ACTIVE version used by runtime evaluators.</CardDescription>
          </div>
          {canConfigure ? (
            <Button
              type="button"
              onClick={() => {
                setEditingVersion(null);
                setIsVersionDialogOpen(true);
              }}
            >
              <Plus className="size-4" />
              Create Draft
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {activeVersion ? (
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-slate-500">Version</p>
                <p className="font-medium text-slate-900">{activeVersion.version_code}</p>
              </div>
              <div>
                <p className="text-slate-500">Status</p>
                <Badge className={statusBadgeClass(activeVersion.status)}>
                  {activeVersion.status}
                </Badge>
              </div>
              <div>
                <p className="text-slate-500">Activated At</p>
                <p className="font-medium text-slate-900">
                  {activeVersion.activated_at ? formatDateTime(activeVersion.activated_at) : "-"}
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <p className="text-slate-500">Activated By</p>
                <p className="font-medium text-slate-900">
                  <UserLabel
                    userId={activeVersion.activated_by}
                    canResolveUserNames={canResolveUserNames}
                  />
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <p className="text-slate-500">Description</p>
                <p className="font-medium text-slate-900">{activeVersion.description ?? "-"}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">
              No active config version.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Config Versions</CardTitle>
          <CardDescription>
            Manage draft, activation, and archiving lifecycle for incentive config snapshots.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No config versions found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-2.5 font-medium">Version</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Description</th>
                    <th className="px-3 py-2.5 font-medium">Created</th>
                    <th className="px-3 py-2.5 font-medium">Created By</th>
                    <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((version) => {
                    const canActivate =
                      canConfigure && version.status === CONFIG_VERSION_STATUS.DRAFT;
                    const canArchive =
                      canConfigure &&
                      (version.status === CONFIG_VERSION_STATUS.ACTIVE ||
                        version.status === CONFIG_VERSION_STATUS.DRAFT);
                    const canEdit = canConfigure && version.status === CONFIG_VERSION_STATUS.DRAFT;

                    return (
                      <tr key={version._id} className="border-b border-slate-100 text-slate-700">
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {version.version_code}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge className={statusBadgeClass(version.status)}>
                            {version.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">{version.description ?? "-"}</td>
                        <td className="px-3 py-2.5">{formatDateTime(version.created_at)}</td>
                        <td className="px-3 py-2.5">
                          <UserLabel
                            userId={version.created_by}
                            canResolveUserNames={canResolveUserNames}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-2">
                            {canActivate ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setActivateTarget(version)}
                              >
                                Activate
                              </Button>
                            ) : null}
                            {canArchive ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setArchiveTarget(version)}
                              >
                                Archive
                              </Button>
                            ) : null}
                            {canEdit ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  setEditingVersion(version);
                                  setIsVersionDialogOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Feature Flags</CardTitle>
          <CardDescription>
            Toggle v3 runtime controls from{" "}
            <span className="font-mono">incentive_v3_feature_flags</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <p className="text-sm font-medium text-slate-900">shadow_mode</p>
              <p className="text-xs text-slate-500">
                Keep v2 as payout source, log v3 deltas in parallel.
              </p>
            </div>
            <Switch
              checked={parsedFeatureFlags.shadow_mode}
              disabled={!canConfigure || updatingFeatureKey !== null}
              onCheckedChange={(checked) => handleFeatureToggle("shadow_mode", checked)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <p className="text-sm font-medium text-slate-900">split_preview_enabled</p>
              <p className="text-xs text-slate-500">
                Enable split preview calculations for v3 payouts.
              </p>
            </div>
            <Switch
              checked={parsedFeatureFlags.split_preview_enabled}
              disabled={!canConfigure || updatingFeatureKey !== null}
              onCheckedChange={(checked) => handleFeatureToggle("split_preview_enabled", checked)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <p className="text-sm font-medium text-slate-900">gamification_enabled</p>
              <p className="text-xs text-slate-500">
                Enable v3 gamification engine for eligible personas.
              </p>
            </div>
            <Switch
              checked={parsedFeatureFlags.gamification_enabled}
              disabled={!canConfigure || updatingFeatureKey !== null}
              onCheckedChange={(checked) => handleFeatureToggle("gamification_enabled", checked)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <p className="text-sm font-medium text-slate-900">disbursement_enabled</p>
              <p className="text-xs text-slate-500">
                Enable v3 disbursement processing for payouts.
              </p>
            </div>
            <Switch
              checked={parsedFeatureFlags.disbursement_enabled}
              disabled={!canConfigure || updatingFeatureKey !== null}
              onCheckedChange={(checked) => handleFeatureToggle("disbursement_enabled", checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Rollout Policy</CardTitle>
          <CardDescription>
            Configure runtime mode from{" "}
            <span className="font-mono">incentive_v3_rollout_policy</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-2">
            <Select
              value={parsedRolloutPolicy.mode}
              onValueChange={(value) => handleRolloutModeChange(value as RolloutMode)}
              disabled={!canConfigure || isUpdatingRollout}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select rollout mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OFF">OFF (v2 only)</SelectItem>
                <SelectItem value="SHADOW">SHADOW (v2 primary, v3 logged)</SelectItem>
                <SelectItem value="PARTIAL">PARTIAL (parallel run)</SelectItem>
                <SelectItem value="FULL">FULL (v3 primary)</SelectItem>
              </SelectContent>
            </Select>
            {isUpdatingRollout ? (
              <p className="text-xs text-slate-500">Updating rollout policy...</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isVersionDialogOpen}
        onOpenChange={(open) => {
          setIsVersionDialogOpen(open);
          if (!open) {
            setEditingVersion(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingVersion ? "Edit Draft Version" : "Create Draft Version"}
            </DialogTitle>
            <DialogDescription>
              Provide version metadata and the full JSON config snapshot.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitVersion)} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="version_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Version Code</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="v3.0.1" disabled={isSubmittingVersion} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="Short description of this config version"
                        disabled={isSubmittingVersion}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config_json"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Config JSON</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={14}
                        className="font-mono text-xs"
                        placeholder='{"commission": {"base_bps": 1500}}'
                        disabled={isSubmittingVersion}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsVersionDialogOpen(false)}
                  disabled={isSubmittingVersion}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmittingVersion}>
                  {isSubmittingVersion ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving...
                    </>
                  ) : editingVersion ? (
                    "Update Draft"
                  ) : (
                    "Create Draft"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={activateTarget !== null}
        onOpenChange={(open) => !open && setActivateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate {activateTarget?.version_code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the currently active config version and promote this draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleActivate} disabled={isActivating}>
              {isActivating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Activating...
                </>
              ) : (
                "Activate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiveTarget?.version_code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Archived versions stay immutable and available for historical reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} disabled={isArchiving}>
              {isArchiving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Archiving...
                </>
              ) : (
                "Archive"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
