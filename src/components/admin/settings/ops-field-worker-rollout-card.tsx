"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Loader2, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

type RolloutState = "DISABLED" | "CANARY" | "ENABLED";

function getStateBadgeClass(state: RolloutState): string {
  if (state === "ENABLED") {
    return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  }

  if (state === "CANARY") {
    return "bg-amber-100 text-amber-700 hover:bg-amber-100";
  }

  return "bg-slate-200 text-slate-700 hover:bg-slate-200";
}

export function OpsFieldWorkerRolloutCard() {
  const [isConfirmEnableOpen, setIsConfirmEnableOpen] = useState(false);
  const [isTogglingFlag, setIsTogglingFlag] = useState(false);
  const [isMutatingCanary, setIsMutatingCanary] = useState(false);
  const [selectedCanaryUserId, setSelectedCanaryUserId] = useState("");

  const rolloutDetails = useQuery(api.systemConfig.getOpsFieldWorkerRollout);
  const setOpsFieldWorkerEnabled = useMutation(api.systemConfig.setOpsFieldWorkerEnabled);
  const addOpsFieldWorkerCanaryUser = useMutation(api.systemConfig.addOpsFieldWorkerCanaryUser);
  const removeOpsFieldWorkerCanaryUser = useMutation(
    api.systemConfig.removeOpsFieldWorkerCanaryUser,
  );

  const availableCanaryCandidates = useMemo(() => {
    if (!rolloutDetails) {
      return [];
    }

    const currentCanaryIds = new Set(rolloutDetails.canary_user_ids);
    return rolloutDetails.available_ops_users.filter((user) => !currentCanaryIds.has(user.user_id));
  }, [rolloutDetails]);

  async function updateGlobalFlag(enabled: boolean) {
    try {
      setIsTogglingFlag(true);
      await setOpsFieldWorkerEnabled({ enabled });
      toast.success(enabled ? "Global rollout enabled" : "Global rollout disabled");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update rollout flag";
      toast.error(message);
    } finally {
      setIsTogglingFlag(false);
    }
  }

  async function handleAddCanaryUser() {
    if (!selectedCanaryUserId) {
      toast.error("Select an OPS user to add to canary.");
      return;
    }

    const selectedCandidate = availableCanaryCandidates.find(
      (candidate) => candidate.user_id === selectedCanaryUserId,
    );
    if (!selectedCandidate) {
      toast.error("Selected OPS user is no longer available. Please retry.");
      return;
    }

    try {
      setIsMutatingCanary(true);
      await addOpsFieldWorkerCanaryUser({ user_id: selectedCandidate.user_id });
      toast.success("Canary user added");
      setSelectedCanaryUserId("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add canary user";
      toast.error(message);
    } finally {
      setIsMutatingCanary(false);
    }
  }

  async function handleRemoveCanaryUser(userId: Id<"users">) {
    try {
      setIsMutatingCanary(true);
      await removeOpsFieldWorkerCanaryUser({ user_id: userId });
      toast.success("Canary user removed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove canary user";
      toast.error(message);
    } finally {
      setIsMutatingCanary(false);
    }
  }

  if (rolloutDetails === undefined) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">OPS Field-Worker Rollout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isEnabled = rolloutDetails.enabled;
  const canaryUsers = rolloutDetails.canary_users;
  const rolloutState = rolloutDetails.rollout_state;

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-slate-900">OPS Field-Worker Rollout</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-700">Current State:</span>
          <Badge className={getStateBadgeClass(rolloutState)}>{rolloutState}</Badge>
          <span className="text-xs text-slate-500">({canaryUsers.length} canary users)</span>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">Global Flag</p>
              <p className="text-xs text-slate-600">
                Enable OPS field-worker access for all ACTIVE OPS users.
              </p>
            </div>
            <Switch
              checked={isEnabled}
              disabled={isTogglingFlag}
              onCheckedChange={(checked) => {
                if (checked && !isEnabled) {
                  setIsConfirmEnableOpen(true);
                  return;
                }

                if (!checked && isEnabled) {
                  void updateGlobalFlag(false);
                }
              }}
            />
          </div>
          {isTogglingFlag ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="size-3 animate-spin" />
              Updating rollout flag...
            </p>
          ) : null}
        </div>

        {!isEnabled ? (
          <div className="space-y-3 rounded-md border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">Canary Users</p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={selectedCanaryUserId}
                onValueChange={setSelectedCanaryUserId}
                disabled={isMutatingCanary || availableCanaryCandidates.length === 0}
              >
                <SelectTrigger className="w-full sm:flex-1">
                  <SelectValue placeholder="Select an ACTIVE OPS user" />
                </SelectTrigger>
                <SelectContent>
                  {availableCanaryCandidates.map((candidate) => (
                    <SelectItem key={candidate.user_id} value={candidate.user_id}>
                      {candidate.name} {candidate.phone ? `(${candidate.phone})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                onClick={() => void handleAddCanaryUser()}
                disabled={isMutatingCanary || selectedCanaryUserId.length === 0}
              >
                {isMutatingCanary ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <UserPlus className="size-4" />
                    Add
                  </>
                )}
              </Button>
            </div>

            {canaryUsers.length === 0 ? (
              <p className="text-xs text-slate-500">No canary users configured.</p>
            ) : (
              <div className="space-y-2">
                {canaryUsers.map((user) => (
                  <div
                    key={user.user_id}
                    className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <p className="min-w-0 text-xs text-slate-700">
                      <span className="font-medium text-slate-900">{user.name}</span>
                      <span className="ml-2 font-mono text-slate-500">{user.user_id}</span>
                      {user.phone ? (
                        <span className="ml-2 text-slate-500">({user.phone})</span>
                      ) : null}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => void handleRemoveCanaryUser(user.user_id)}
                      disabled={isMutatingCanary}
                    >
                      <X className="size-4" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {rolloutDetails.invalid_canary_user_ids.length > 0 ? (
              <p className="text-xs text-amber-700">
                Invalid IDs in stored canary config:{" "}
                {rolloutDetails.invalid_canary_user_ids.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}

        {!isEnabled ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" />
              Warning: Enabling globally affects all ACTIVE OPS users.
            </p>
          </div>
        ) : null}
      </CardContent>

      <AlertDialog open={isConfirmEnableOpen} onOpenChange={setIsConfirmEnableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable field-worker access globally?</AlertDialogTitle>
            <AlertDialogDescription>
              This will enable field-worker access for all ACTIVE OPS users.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTogglingFlag}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isTogglingFlag}
              onClick={(event) => {
                event.preventDefault();
                void (async () => {
                  await updateGlobalFlag(true);
                  setIsConfirmEnableOpen(false);
                })();
              }}
            >
              {isTogglingFlag ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Enabling...
                </>
              ) : (
                "Enable for all OPS"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
