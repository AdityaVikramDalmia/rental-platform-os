"use client";

import { useQuery } from "convex/react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { PERMISSIONS, type VisitStatus } from "../../../../../../lib/constants";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { VisitStatusBadge } from "@/components/shared/visit-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { VisitDetailPanel } from "../components/visit-detail-panel";
import { VisitStatusActions } from "../components/visit-status-actions";

export default function VisitDetailPage() {
  const params = useParams<{ id: string }>();
  const visitId = params.id as Id<"visits">;

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
  const hasVisitsView = rolesLoaded && permissionSet.has(PERMISSIONS.VISITS_VIEW);
  const hasVisitsEdit = rolesLoaded && permissionSet.has(PERMISSIONS.VISITS_EDIT);
  const hasVisitsCancel = rolesLoaded && permissionSet.has(PERMISSIONS.VISITS_CANCEL);

  const visitData = useQuery(api.visits.getById, hasVisitsView ? { id: visitId } : "skip");

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

  if (!hasVisitsView) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <ShieldAlert className="size-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Access Denied</p>
        <p className="text-sm text-slate-500">You do not have permission to view visits.</p>
        <Link href="/admin/dashboard" className="text-sm text-blue-600 hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (visitData === undefined) {
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

  if (!visitData) {
    return (
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: "Visits", href: "/admin/visits" },
            { label: `Visit #${visitId.slice(0, 8)}` },
          ]}
        />
        <p className="text-sm text-slate-600">Visit not found.</p>
      </div>
    );
  }

  const buildingName = visitData.building?.name ?? "—";
  const flatNumber = visitData.lead?.flat_number ?? "—";
  const floorNumber = visitData.lead?.floor_number ?? "—";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Breadcrumb
          items={[
            { label: "Visits", href: "/admin/visits" },
            { label: `Visit #${visitData.visit._id.slice(0, 8)}` },
          ]}
        />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {buildingName} / Fl{floorNumber} / {flatNumber}
              </h2>
              <VisitStatusBadge status={visitData.visit.status as VisitStatus} size="md" />
            </div>
            {visitData.society && (
              <p className="text-sm text-slate-500">
                {visitData.society.name}, {visitData.society.city}
              </p>
            )}
          </div>
        </div>
      </div>

      {visitData.visit.needs_reassignment && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="size-5 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Needs Reassignment</p>
              <p className="text-xs text-amber-700">
                The assigned guard is no longer available. Please reassign this visit to another
                guard.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {(hasVisitsEdit || hasVisitsCancel) && (
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-4">
            <VisitStatusActions
              visitId={visitId}
              status={visitData.visit.status as VisitStatus}
              canEdit={hasVisitsEdit}
              canCancel={hasVisitsCancel}
            />
          </CardContent>
        </Card>
      )}

      <VisitDetailPanel data={visitData} canEdit={hasVisitsEdit} />
    </div>
  );
}
