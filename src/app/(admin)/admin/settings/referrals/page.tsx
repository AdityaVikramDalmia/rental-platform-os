"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Loader2, Plus } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../../convex/_generated/dataModel";
import {
  PERMISSIONS,
  REFERRAL_CONFIG_SCOPE_TYPE,
  REFERRAL_TYPE_LABELS,
} from "../../../../../../lib/constants";
import { formatDateTime } from "../../../../../../lib/dates";
import { formatINR } from "../../../../../../lib/money";
import { ReferralConfigFormDialog } from "@/components/admin/referral-config-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ReferralConfigDoc = Doc<"referral_config">;

const SCOPE_ORDER: Record<ReferralConfigDoc["scope_type"], number> = {
  [REFERRAL_CONFIG_SCOPE_TYPE.BUILDING]: 3,
  [REFERRAL_CONFIG_SCOPE_TYPE.SOCIETY]: 2,
  [REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL]: 1,
};

function ScopeLabel({
  config,
  societyName,
}: {
  config: ReferralConfigDoc;
  societyName: string | null;
}) {
  const building = useQuery(
    api.buildings.getById,
    config.scope_type === REFERRAL_CONFIG_SCOPE_TYPE.BUILDING && config.scope_id
      ? { id: config.scope_id as Id<"buildings"> }
      : "skip",
  );

  if (config.scope_type === REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL) {
    return <span>Global</span>;
  }

  if (config.scope_type === REFERRAL_CONFIG_SCOPE_TYPE.SOCIETY) {
    return <span>{societyName ?? config.scope_id}</span>;
  }

  if (building === undefined) {
    return <span className="text-slate-500">Loading building...</span>;
  }

  if (!building) {
    return <span>{config.scope_id}</span>;
  }

  return <span>{building.name}</span>;
}

function UpdatedByLabel({
  userId,
  canResolveName,
}: {
  userId: Id<"users">;
  canResolveName: boolean;
}) {
  const updatedBy = useQuery(api.users.getById, canResolveName ? { id: userId } : "skip");

  if (!canResolveName) {
    return <span className="font-mono text-xs text-slate-600">{userId}</span>;
  }

  if (updatedBy === undefined) {
    return <span className="text-slate-500">Loading admin...</span>;
  }

  if (!updatedBy) {
    return <span className="font-mono text-xs text-slate-600">{userId}</span>;
  }

  return <span>{updatedBy.name}</span>;
}

export default function ReferralSettingsPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );

  const permissionSet = useMemo(() => {
    const permissions = new Set<string>();

    if (!roleAssignments) {
      return permissions;
    }

    for (const assignment of roleAssignments) {
      for (const permission of assignment.role.permissions) {
        permissions.add(permission);
      }
    }

    return permissions;
  }, [roleAssignments]);

  const hasReferralsView = permissionSet.has(PERMISSIONS.REFERRALS_VIEW);
  const hasReferralsConfigure = permissionSet.has(PERMISSIONS.REFERRALS_CONFIGURE);

  const referralConfigs = useQuery(
    api.referralConfig.list,
    hasReferralsView && hasReferralsConfigure ? {} : "skip",
  );
  const societies = useQuery(api.societies.list, hasReferralsConfigure ? {} : "skip");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<Id<"referral_config"> | null>(null);

  const societyMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const society of societies ?? []) {
      map.set(society._id, society.name);
    }

    return map;
  }, [societies]);

  const sortedConfigs = useMemo(() => {
    const configs = [...(referralConfigs ?? [])];

    return configs.sort((a, b) => {
      if (a.referral_type !== b.referral_type) {
        return a.referral_type.localeCompare(b.referral_type);
      }

      if (SCOPE_ORDER[a.scope_type] !== SCOPE_ORDER[b.scope_type]) {
        return SCOPE_ORDER[b.scope_type] - SCOPE_ORDER[a.scope_type];
      }

      const aScope = a.scope_id ?? "";
      const bScope = b.scope_id ?? "";
      return aScope.localeCompare(bScope);
    });
  }, [referralConfigs]);

  const editingConfig = useMemo(() => {
    if (!editingConfigId || !referralConfigs) {
      return null;
    }

    return referralConfigs.find((config) => config._id === editingConfigId) ?? null;
  }, [editingConfigId, referralConfigs]);

  function handleCreateAction() {
    setEditingConfigId(null);
    setIsDialogOpen(true);
  }

  function handleEditAction(configId: Id<"referral_config">) {
    setEditingConfigId(configId);
    setIsDialogOpen(true);
  }

  function handleDialogOpenChangeAction(open: boolean) {
    setIsDialogOpen(open);

    if (!open) {
      setEditingConfigId(null);
    }
  }

  if (currentUser === undefined || roleAssignments === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (
    !currentUser ||
    !(
      currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ??
      (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS")
    )
  ) {
    return null;
  }

  if (!hasReferralsConfigure) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to configure referral settings.
      </div>
    );
  }

  if (!hasReferralsView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You need referrals view permission to review existing config entries.
      </div>
    );
  }

  if (referralConfigs === undefined || societies === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Referral Settings
          </h2>
          <p className="text-sm text-slate-600">
            Manage payout rules by scope. Building rules override society rules, and society rules
            override global defaults.
          </p>
        </div>

        <Button type="button" onClick={handleCreateAction} className="gap-1.5">
          <Plus className="size-4" />
          Add Config
        </Button>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Referral Configurations</CardTitle>
          <CardDescription className="text-sm text-slate-600">
            Define sign-up and finding bonuses in rupees and configure publish/closure split.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedConfigs.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No referral configs found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1160px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-2.5 font-medium">Type</th>
                    <th className="px-3 py-2.5 font-medium">Scope</th>
                    <th className="px-3 py-2.5 font-medium">Sign-up Bonus</th>
                    <th className="px-3 py-2.5 font-medium">Finding Bonus Total</th>
                    <th className="px-3 py-2.5 font-medium">Split</th>
                    <th className="px-3 py-2.5 font-medium">Created</th>
                    <th className="px-3 py-2.5 font-medium">Updated By</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {sortedConfigs.map((config) => {
                    const scopeSocietyName =
                      config.scope_type === REFERRAL_CONFIG_SCOPE_TYPE.SOCIETY && config.scope_id
                        ? (societyMap.get(config.scope_id) ?? null)
                        : null;

                    return (
                      <tr key={config._id} className="border-b border-slate-100 text-slate-700">
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {REFERRAL_TYPE_LABELS[config.referral_type]}
                        </td>
                        <td className="px-3 py-2.5">
                          <ScopeLabel config={config} societyName={scopeSocietyName} />
                        </td>
                        <td className="px-3 py-2.5">{formatINR(config.sign_up_bonus)}</td>
                        <td className="px-3 py-2.5">{formatINR(config.finding_bonus_total)}</td>
                        <td className="px-3 py-2.5">
                          {config.publish_split_pct}% / {config.closure_split_pct}%
                        </td>
                        <td className="px-3 py-2.5">{formatDateTime(config._creationTime)}</td>
                        <td className="px-3 py-2.5">
                          <UpdatedByLabel
                            userId={config.updated_by_admin_id}
                            canResolveName={
                              currentUser.user_types?.includes("ADMIN") ??
                              currentUser.user_type === "ADMIN"
                            }
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            className={
                              config.is_active
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-600"
                            }
                          >
                            {config.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditAction(config._id)}
                          >
                            Edit
                          </Button>
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

      <ReferralConfigFormDialog
        open={isDialogOpen}
        openChangeAction={handleDialogOpenChangeAction}
        existingConfig={editingConfig}
        societies={societies.map((society) => ({
          _id: society._id,
          name: society.name,
          city: society.city,
        }))}
      />
    </div>
  );
}
