"use client";

import { useQuery } from "convex/react";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { CLOSURE_STATUS, PERMISSIONS, type ClosureStatus } from "../../../../../../lib/constants";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { ClosureStatusBadge } from "@/components/shared/closure-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClosureDetailPanel } from "../components/closure-detail-panel";
import { ClosureStatusActions } from "../components/closure-status-actions";

export default function ClosureDetailPage() {
  const params = useParams<{ id: string }>();
  const closureId = params.id as Id<"closures">;

  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );
  const permissionSet = useMemo(() => {
    const permissions = new Set<string>();
    if (!roleAssignments) return permissions;
    for (const assignment of roleAssignments) {
      for (const permission of assignment.role.permissions) {
        permissions.add(permission);
      }
    }
    return permissions;
  }, [roleAssignments]);

  const rolesLoaded = roleAssignments !== undefined;
  const hasClosuresView = rolesLoaded && permissionSet.has(PERMISSIONS.CLOSURES_VIEW);
  const hasClosuresEdit = rolesLoaded && permissionSet.has(PERMISSIONS.CLOSURES_EDIT);
  const hasClosuresConfirm = rolesLoaded && permissionSet.has(PERMISSIONS.CLOSURES_CONFIRM);
  const hasPayoutsCreate = rolesLoaded && permissionSet.has(PERMISSIONS.PAYOUTS_CREATE);

  const closureData = useQuery(api.closures.getById, hasClosuresView ? { id: closureId } : "skip");

  if (currentUser === undefined || !rolesLoaded) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-10 w-72" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!hasClosuresView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <ShieldAlert className="size-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Access Denied</p>
        <p className="text-sm text-slate-500">You do not have permission to view closures.</p>
        <Link href="/admin/dashboard" className="text-sm text-blue-600 hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (closureData === undefined) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-10 w-72" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!closureData) {
    return (
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: "Closures", href: "/admin/closures" },
            { label: `Closure #${closureId.slice(0, 8)}` },
          ]}
        />
        <p className="text-sm text-slate-600">Closure not found.</p>
      </div>
    );
  }

  const buildingName = closureData.building?.name ?? "—";
  const flatNumber = closureData.lead?.flat_number ?? "—";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Breadcrumb
          items={[
            { label: "Closures", href: "/admin/closures" },
            { label: `Closure #${closureData.closure._id.slice(0, 8)}` },
          ]}
        />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {buildingName} / {flatNumber}
              </h2>
              <ClosureStatusBadge status={closureData.closure.status as ClosureStatus} size="md" />
            </div>
            {closureData.society && (
              <p className="text-sm text-slate-500">
                {closureData.society.name}, {closureData.society.city}
              </p>
            )}
          </div>
        </div>
      </div>

      {(hasClosuresConfirm || hasClosuresEdit) &&
        closureData.closure.status !== CLOSURE_STATUS.CONFIRMED &&
        closureData.closure.status !== CLOSURE_STATUS.CANCELLED && (
          <Card className="border-slate-200 bg-white">
            <CardContent className="py-4">
              <ClosureStatusActions
                closureId={closureId}
                status={closureData.closure.status as ClosureStatus}
                canConfirm={hasClosuresConfirm}
                canCancel={hasClosuresEdit}
              />
            </CardContent>
          </Card>
        )}

      <ClosureDetailPanel
        data={closureData}
        canEdit={hasClosuresEdit}
        canCreatePayout={hasPayoutsCreate}
      />
    </div>
  );
}
