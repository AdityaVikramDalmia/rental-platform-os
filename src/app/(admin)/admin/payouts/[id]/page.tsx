"use client";

import { useQuery } from "convex/react";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { PAYOUT_STATUS, PERMISSIONS, type PayoutStatus } from "../../../../../../lib/constants";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { PayoutStatusBadge } from "@/components/shared/payout-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PayoutDetailPanel } from "../components/payout-detail-panel";
import { PayoutStatusActions } from "../components/payout-status-actions";

export default function PayoutDetailPage() {
  const params = useParams<{ id: string }>();
  const payoutId = params.id as Id<"payouts">;

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
  const hasPayoutsView = rolesLoaded && permissionSet.has(PERMISSIONS.PAYOUTS_VIEW);
  const hasPayoutsApprove = rolesLoaded && permissionSet.has(PERMISSIONS.PAYOUTS_APPROVE);
  const hasPayoutsDisburse = rolesLoaded && permissionSet.has(PERMISSIONS.PAYOUTS_DISBURSE);
  const hasPayoutsVoid = rolesLoaded && permissionSet.has(PERMISSIONS.PAYOUTS_VOID);

  const payoutData = useQuery(api.payouts.getById, hasPayoutsView ? { id: payoutId } : "skip");

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

  if (!hasPayoutsView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <ShieldAlert className="size-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Access Denied</p>
        <p className="text-sm text-slate-500">You do not have permission to view payouts.</p>
        <Link href="/admin/dashboard" className="text-sm text-blue-600 hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (payoutData === undefined) {
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

  if (!payoutData) {
    return (
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: "Payouts", href: "/admin/payouts" },
            { label: `Payout #${payoutId.slice(0, 8)}` },
          ]}
        />
        <p className="text-sm text-slate-600">Payout not found.</p>
      </div>
    );
  }

  const guardName = payoutData.guard?.name ?? "—";
  const isTerminal =
    payoutData.payout.status === PAYOUT_STATUS.DISBURSED ||
    payoutData.payout.status === PAYOUT_STATUS.FAILED ||
    payoutData.payout.status === PAYOUT_STATUS.VOIDED;
  const canShowActions = hasPayoutsApprove || hasPayoutsDisburse || hasPayoutsVoid;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Breadcrumb
          items={[
            { label: "Payouts", href: "/admin/payouts" },
            { label: `Payout #${payoutData.payout._id.slice(0, 8)}` },
          ]}
        />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{guardName}</h2>
              <PayoutStatusBadge status={payoutData.payout.status as PayoutStatus} size="md" />
            </div>
            <p className="text-sm text-slate-500">Payout ID: {payoutData.payout._id}</p>
          </div>
        </div>
      </div>

      {canShowActions && !isTerminal && (
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-4">
            <PayoutStatusActions
              payoutId={payoutData.payout._id}
              status={payoutData.payout.status as PayoutStatus}
              canApprove={hasPayoutsApprove}
              canDisburse={hasPayoutsDisburse}
              canVoid={hasPayoutsVoid}
            />
          </CardContent>
        </Card>
      )}

      <PayoutDetailPanel data={payoutData} canOverrideAmount={hasPayoutsApprove} />
    </div>
  );
}
