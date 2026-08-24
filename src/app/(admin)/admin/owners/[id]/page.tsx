"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import {
  Building2,
  Calendar,
  ClipboardList,
  ClipboardPenLine,
  FileText,
  History,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  UserRoundCog,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  CLOSURE_STATUS_COLORS,
  LEAD_STATUS_COLORS,
  LISTING_STATUS_COLORS,
  OWNER_LIFECYCLE_LABELS,
  OWNER_LIFECYCLE_STAGE,
  PERMISSIONS,
  RM_ASSIGNMENT_STATUS,
  RM_ASSIGNMENT_STATUS_LABELS,
  RM_CHECK_IN_OUTCOME,
} from "../../../../../../lib/constants";
import { formatDate, formatRelativeTime } from "../../../../../../lib/dates";
import { formatPhoneDisplay, isValidConvexId } from "../../../../../../lib/validators";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { CheckInDialog } from "@/components/admin/rm/CheckInDialog";
import { ReassignRmDialog } from "@/components/admin/rm/ReassignRmDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LIFECYCLE_BADGE_CLASS: Record<string, string> = {
  [OWNER_LIFECYCLE_STAGE.PROSPECT]: "border-slate-200 bg-slate-100 text-slate-600",
  [OWNER_LIFECYCLE_STAGE.VERIFIED]: "border-blue-200 bg-blue-50 text-blue-700",
  [OWNER_LIFECYCLE_STAGE.ACTIVE]: "border-green-200 bg-green-50 text-green-700",
  [OWNER_LIFECYCLE_STAGE.MANAGED]: "border-violet-200 bg-violet-50 text-violet-700",
  [OWNER_LIFECYCLE_STAGE.DORMANT]: "border-amber-200 bg-amber-50 text-amber-700",
  [OWNER_LIFECYCLE_STAGE.CHURNED]: "border-red-200 bg-red-50 text-red-700",
};

const SOURCE_LABELS: Record<string, string> = {
  GUARD_LEAD: "Guard Lead",
  OWNER_SERVICE_REQUEST: "Service Request",
  OPS_CREATED: "Ops Created",
};

const SOURCE_BADGE_CLASS: Record<string, string> = {
  GUARD_LEAD: "border-cyan-200 bg-cyan-50 text-cyan-700",
  OWNER_SERVICE_REQUEST: "border-orange-200 bg-orange-50 text-orange-700",
  OPS_CREATED: "border-slate-200 bg-slate-100 text-slate-600",
};

const RM_STATUS_BADGE_CLASS: Record<string, string> = {
  [RM_ASSIGNMENT_STATUS.ACTIVE]: "border-green-200 bg-green-50 text-green-700",
  [RM_ASSIGNMENT_STATUS.WARNING]: "border-amber-200 bg-amber-50 text-amber-700",
  [RM_ASSIGNMENT_STATUS.ESCALATED]: "border-red-200 bg-red-50 text-red-700",
  [RM_ASSIGNMENT_STATUS.REASSIGNED]: "border-slate-200 bg-slate-100 text-slate-600",
  [RM_ASSIGNMENT_STATUS.ENDED]: "border-slate-200 bg-slate-100 text-slate-600",
};

const CHECK_IN_OUTCOME_BADGE_CLASS: Record<string, string> = {
  [RM_CHECK_IN_OUTCOME.RESOLVED]: "border-green-200 bg-green-50 text-green-700",
  [RM_CHECK_IN_OUTCOME.PENDING]: "border-amber-200 bg-amber-50 text-amber-700",
  [RM_CHECK_IN_OUTCOME.ESCALATED]: "border-red-200 bg-red-50 text-red-700",
};

const CHECK_IN_TYPE_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  ISSUE: "Issue",
  RE_LISTING: "Re-listing",
  OWNER_INITIATED: "Owner Initiated",
  AD_HOC: "Ad Hoc",
};

const METHOD_LABELS: Record<string, string> = {
  CALL: "Call",
  WHATSAPP: "WhatsApp",
  IN_PERSON: "In Person",
  OTHER: "Other",
};

const ASSIGNED_BY_LABELS: Record<string, string> = {
  SYSTEM: "Auto-assigned",
  ADMIN: "Admin assigned",
};

function getInitials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-64" />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {["stat-skeleton-1", "stat-skeleton-2", "stat-skeleton-3", "stat-skeleton-4"].map(
          (skeletonKey) => (
            <Card key={skeletonKey} className="border-slate-200">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ),
        )}
      </div>

      <Card className="border-slate-200">
        <CardContent className="space-y-4 pt-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function RmHistoryTab({ ownerId }: { ownerId: Id<"owners"> }) {
  const assignments = useQuery(api.rmAssignments.listByOwner, { owner_id: ownerId });

  if (assignments === undefined) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <History className="mx-auto mb-3 size-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">No RM history yet</p>
        <p className="mt-1 text-sm text-slate-500">
          RM assignments are auto-created when closures are confirmed.
        </p>
      </div>
    );
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="pt-6">
        <div className="space-y-4">
          {assignments.map((assignment) => (
            <RmAssignmentCard key={assignment._id} assignment={assignment} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RmAssignmentCard({
  assignment,
}: {
  assignment: {
    _id: Id<"owner_rm_assignments">;
    rm_guard_id: Id<"guard_profiles">;
    status: string;
    assigned_by: string;
    created_at: number;
    reassigned_at?: number;
    reassigned_to_guard_id?: Id<"guard_profiles">;
    reassignment_reason?: string;
  };
}) {
  const rmName = useQuery(api.owners.getGuardProfileName, {
    guard_profile_id: assignment.rm_guard_id,
  });
  const reassignedToName = useQuery(
    api.owners.getGuardProfileName,
    assignment.reassigned_to_guard_id
      ? { guard_profile_id: assignment.reassigned_to_guard_id }
      : "skip",
  );

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          className={
            RM_STATUS_BADGE_CLASS[assignment.status] ??
            "border-slate-200 bg-slate-100 text-slate-600"
          }
        >
          {RM_ASSIGNMENT_STATUS_LABELS[assignment.status] ?? assignment.status}
        </Badge>
        <span className="text-sm text-slate-600">
          {ASSIGNED_BY_LABELS[assignment.assigned_by] ?? assignment.assigned_by}
        </span>
        <span className="text-sm text-slate-500">{formatDate(assignment.created_at)}</span>
      </div>
      <div className="mt-2 text-sm text-slate-700">
        <span className="font-medium">RM:</span> {rmName ?? "..."}
      </div>
      {assignment.status === RM_ASSIGNMENT_STATUS.REASSIGNED && (
        <div className="mt-2 space-y-1 rounded-md bg-slate-50 p-2 text-sm">
          {assignment.reassigned_at && (
            <p className="text-slate-500">
              Reassigned {formatRelativeTime(assignment.reassigned_at)}
            </p>
          )}
          {reassignedToName && (
            <p className="text-slate-600">
              <span className="font-medium">New RM:</span> {reassignedToName}
            </p>
          )}
          {assignment.reassignment_reason && (
            <p className="text-slate-600">
              <span className="font-medium">Reason:</span> {assignment.reassignment_reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CheckInsTab({
  ownerId,
  onLogCheckIn,
  canLogCheckIn,
}: {
  ownerId: Id<"owners">;
  onLogCheckIn: () => void;
  canLogCheckIn: boolean;
}) {
  const checkIns = useQuery(api.rmAssignments.listCheckIns, { owner_id: ownerId });

  if (checkIns === undefined) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Check-in History</CardTitle>
        {canLogCheckIn ? (
          <Button type="button" size="sm" variant="outline" onClick={onLogCheckIn}>
            <ClipboardPenLine className="mr-1.5 size-3.5" />
            Log Check-in
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {checkIns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center">
            <MessageSquare className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No check-ins yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {checkIns.map((checkIn) => (
              <div key={checkIn._id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                    {CHECK_IN_TYPE_LABELS[checkIn.check_in_type] ?? checkIn.check_in_type}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {METHOD_LABELS[checkIn.method] ?? checkIn.method}
                  </span>
                  <Badge
                    className={
                      CHECK_IN_OUTCOME_BADGE_CLASS[checkIn.outcome] ??
                      "border-slate-200 bg-slate-100 text-slate-600"
                    }
                  >
                    {checkIn.outcome}
                  </Badge>
                  {checkIn.owner_satisfaction !== undefined && (
                    <span className="text-xs text-slate-500">
                      Satisfaction: {checkIn.owner_satisfaction}/5
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-slate-700">{checkIn.summary}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatRelativeTime(checkIn.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PropertiesTab({ ownerId }: { ownerId: Id<"owners"> }) {
  const leads = useQuery(api.owners.getOwnerLeads, { owner_id: ownerId });
  const listings = useQuery(api.owners.getOwnerListings, { owner_id: ownerId });
  const closures = useQuery(api.owners.getOwnerClosures, { owner_id: ownerId });

  if (leads === undefined || listings === undefined || closures === undefined) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 pt-6">
          {["prop-skeleton-1", "prop-skeleton-2", "prop-skeleton-3"].map((skeletonKey) => (
            <Skeleton key={skeletonKey} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const listingsByLead = new Map<string, (typeof listings)[number]>();
  for (const listing of listings) {
    if (listing.lead_id) {
      listingsByLead.set(listing.lead_id, listing);
    }
  }

  const closuresByLead = new Map<string, (typeof closures)[number]>();
  for (const closure of closures) {
    if (closure.lead_id) {
      closuresByLead.set(closure.lead_id, closure);
    }
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <Building2 className="mx-auto mb-3 size-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">No properties</p>
        <p className="mt-1 text-sm text-slate-500">No leads linked to this owner yet.</p>
      </div>
    );
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-3 font-medium">Property</th>
                <th className="px-3 py-2.5 font-medium">Lead Status</th>
                <th className="px-3 py-2.5 font-medium">Listing</th>
                <th className="px-3 py-2.5 font-medium">Closure</th>
                <th className="px-3 py-2.5 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const listing = listingsByLead.get(lead._id);
                const closure = closuresByLead.get(lead._id);

                return (
                  <tr key={lead._id} className="border-b border-slate-100">
                    <td className="py-3 pr-3">
                      <Link
                        href={`/admin/leads?id=${lead._id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {lead.flat_number}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {[lead.building_name, lead.society_name].filter(Boolean).join(" \u00b7 ")}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/leads?id=${lead._id}`}>
                        <Badge
                          className={
                            LEAD_STATUS_COLORS[lead.status as keyof typeof LEAD_STATUS_COLORS] ??
                            "bg-slate-100 text-slate-600"
                          }
                        >
                          {lead.status}
                        </Badge>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      {listing ? (
                        <Link href={`/admin/listings/${listing._id}`}>
                          <Badge
                            className={
                              LISTING_STATUS_COLORS[
                                listing.status as keyof typeof LISTING_STATUS_COLORS
                              ] ?? "bg-slate-100 text-slate-600"
                            }
                          >
                            {listing.status}
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-slate-400">{"\u2014"}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {closure ? (
                        <Link href={`/admin/closures/${closure._id}`}>
                          <Badge
                            className={
                              CLOSURE_STATUS_COLORS[
                                closure.status as keyof typeof CLOSURE_STATUS_COLORS
                              ] ?? "bg-slate-100 text-slate-600"
                            }
                          >
                            {closure.status}
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-slate-400">{"\u2014"}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(lead._creationTime)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityTab({
  owner,
  includeRmData,
}: {
  owner: {
    _id: Id<"owners">;
    source: string;
    lifecycle_stage: string;
    created_at: number;
    lifecycle_updated_at: number;
    last_activity_at: number;
  };
  includeRmData: boolean;
}) {
  const assignments = useQuery(
    api.rmAssignments.listByOwner,
    includeRmData ? { owner_id: owner._id } : "skip",
  );
  const checkIns = useQuery(
    api.rmAssignments.listCheckIns,
    includeRmData ? { owner_id: owner._id } : "skip",
  );

  if (includeRmData && (assignments === undefined || checkIns === undefined)) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  const events: Array<{ at: number; title: string; detail?: string }> = [
    {
      at: owner.created_at,
      title: "Owner profile created",
      detail: SOURCE_LABELS[owner.source] ?? owner.source,
    },
    {
      at: owner.lifecycle_updated_at,
      title: `Lifecycle set to ${OWNER_LIFECYCLE_LABELS[owner.lifecycle_stage] ?? owner.lifecycle_stage}`,
    },
  ];

  if (owner.last_activity_at > owner.lifecycle_updated_at) {
    events.push({
      at: owner.last_activity_at,
      title: "Last owner activity",
    });
  }

  if (includeRmData) {
    for (const assignment of assignments ?? []) {
      events.push({
        at: assignment.created_at,
        title: "RM assignment created",
        detail: RM_ASSIGNMENT_STATUS_LABELS[assignment.status] ?? assignment.status,
      });

      if (assignment.reassigned_at) {
        events.push({
          at: assignment.reassigned_at,
          title: "RM reassigned",
          detail: assignment.reassignment_reason,
        });
      }
    }

    for (const checkIn of checkIns ?? []) {
      events.push({
        at: checkIn.created_at,
        title: "RM check-in logged",
        detail: `${CHECK_IN_TYPE_LABELS[checkIn.check_in_type] ?? checkIn.check_in_type} - ${checkIn.outcome}`,
      });
    }
  }

  const timeline = events
    .filter((event) => event.at > 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, 25);

  if (timeline.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <ClipboardList className="mx-auto mb-3 size-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="pt-6">
        <div className="space-y-3">
          {timeline.map((event) => (
            <div
              key={`${event.at}-${event.title}-${event.detail ?? ""}`}
              className="rounded-lg border border-slate-200 p-3"
            >
              <p className="text-sm font-medium text-slate-800">{event.title}</p>
              {event.detail ? (
                <p className="mt-0.5 text-sm text-slate-600">{event.detail}</p>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">{formatDate(event.at)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OwnerDetailPage() {
  const params = useParams<{ id: string }>();
  const isValidId = isValidConvexId(params.id);
  const ownerId = isValidId ? (params.id as Id<"owners">) : null;
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
  const hasOwnersView = permissionSet.has(PERMISSIONS.OWNERS_VIEW);
  const hasRmView = permissionSet.has(PERMISSIONS.RM_VIEW);
  const hasRmCheckIn = permissionSet.has(PERMISSIONS.RM_CHECK_IN);
  const hasRmReassign = permissionSet.has(PERMISSIONS.RM_REASSIGN);
  const hasGuardsView = permissionSet.has(PERMISSIONS.GUARDS_VIEW);

  const owner = useQuery(api.owners.getById, ownerId ? { id: ownerId } : "skip");

  const rmName = useQuery(
    api.owners.getGuardProfileName,
    hasRmView && owner?.current_rm_guard_id
      ? { guard_profile_id: owner.current_rm_guard_id }
      : "skip",
  );

  const rmAssignments = useQuery(
    api.rmAssignments.listByOwner,
    hasRmView && ownerId ? { owner_id: ownerId } : "skip",
  );
  const activeAssignment = hasRmView
    ? rmAssignments?.find(
        (a) =>
          a.status === RM_ASSIGNMENT_STATUS.ACTIVE ||
          a.status === RM_ASSIGNMENT_STATUS.WARNING ||
          a.status === RM_ASSIGNMENT_STATUS.ESCALATED,
      )
    : undefined;

  const canLogCheckIn = hasRmView && hasRmCheckIn && Boolean(activeAssignment);
  const canReassignRm = hasRmView && hasRmReassign && hasGuardsView && Boolean(activeAssignment);
  const hasRmActions = canLogCheckIn || canReassignRm;

  const [reassignOpen, setReassignOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);

  if (!isValidId) {
    return (
      <div className="space-y-4">
        <Breadcrumb
          items={[{ label: "Owners", href: "/admin/owners" }, { label: "Owner not found" }]}
        />
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Owner not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">The provided owner ID is invalid.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentUser === undefined || roleAssignments === undefined) {
    return <LoadingSkeleton />;
  }

  if (!hasOwnersView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view owners.
      </div>
    );
  }

  if (owner === undefined) {
    return <LoadingSkeleton />;
  }

  if (owner === null) {
    return (
      <div className="space-y-4">
        <Breadcrumb
          items={[{ label: "Owners", href: "/admin/owners" }, { label: "Owner not found" }]}
        />
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">Owner not found</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const displayName = owner.name ?? "Unknown Owner";

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          { label: "Owners", href: "/admin/owners" },
          { label: owner.name ?? formatPhoneDisplay(owner.phone) },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16 text-lg">
            <AvatarFallback className="bg-slate-200 text-lg font-semibold text-slate-700">
              {owner.name ? getInitials(owner.name) : <Phone className="size-6" />}
            </AvatarFallback>
          </Avatar>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {displayName}
              </h2>
              <Badge
                className={
                  LIFECYCLE_BADGE_CLASS[owner.lifecycle_stage] ??
                  "border-slate-200 bg-slate-100 text-slate-600"
                }
              >
                {OWNER_LIFECYCLE_LABELS[owner.lifecycle_stage] ?? owner.lifecycle_stage}
              </Badge>
              <Badge
                className={
                  SOURCE_BADGE_CLASS[owner.source] ?? "border-slate-200 bg-slate-100 text-slate-600"
                }
              >
                {SOURCE_LABELS[owner.source] ?? owner.source}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" />
                {formatPhoneDisplay(owner.phone)}
              </span>
              {owner.email ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" />
                  {owner.email}
                </span>
              ) : null}
              {hasRmView && rmName ? (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  RM: {rmName}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {hasRmActions && activeAssignment && (
          <div className="flex gap-2">
            {canLogCheckIn ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setCheckInOpen(true)}
              >
                <ClipboardPenLine className="mr-1.5 size-3.5" />
                Log Check-in
              </Button>
            ) : null}
            {canReassignRm ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setReassignOpen(true)}
              >
                <UserRoundCog className="mr-1.5 size-3.5" />
                Reassign RM
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Leads</CardTitle>
            <ClipboardList className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-slate-900">
              {owner.total_leads_count}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Active Properties</CardTitle>
            <Building2 className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-slate-900">
              {owner.active_properties_count}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Closures</CardTitle>
            <FileText className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-slate-900">
              {owner.total_closures_count}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Lifecycle Stage</CardTitle>
            <Calendar className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <Badge
              className={
                LIFECYCLE_BADGE_CLASS[owner.lifecycle_stage] ??
                "border-slate-200 bg-slate-100 text-slate-600"
              }
            >
              {OWNER_LIFECYCLE_LABELS[owner.lifecycle_stage] ?? owner.lifecycle_stage}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="properties">
        <TabsList className="w-full justify-start bg-slate-100">
          <TabsTrigger value="properties">
            <Building2 className="size-3.5" />
            Properties
          </TabsTrigger>
          {hasRmView ? (
            <TabsTrigger value="rm-history">
              <History className="size-3.5" />
              RM History
            </TabsTrigger>
          ) : null}
          {hasRmView ? (
            <TabsTrigger value="check-ins">
              <MessageSquare className="size-3.5" />
              Check-ins
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="activity">
            <ClipboardList className="size-3.5" />
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="properties">
          <PropertiesTab ownerId={owner._id} />
        </TabsContent>

        {hasRmView ? (
          <TabsContent value="rm-history">
            <RmHistoryTab ownerId={owner._id} />
          </TabsContent>
        ) : null}

        {hasRmView ? (
          <TabsContent value="check-ins">
            <CheckInsTab
              ownerId={owner._id}
              onLogCheckIn={() => setCheckInOpen(true)}
              canLogCheckIn={canLogCheckIn}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="activity">
          <ActivityTab owner={owner} includeRmData={hasRmView} />
        </TabsContent>
      </Tabs>

      {activeAssignment && hasRmActions ? (
        <>
          {canReassignRm ? (
            <ReassignRmDialog
              open={reassignOpen}
              onOpenChange={setReassignOpen}
              assignmentId={activeAssignment._id}
              ownerName={displayName}
              currentRmName={rmName ?? "Unknown"}
            />
          ) : null}
          {canLogCheckIn ? (
            <CheckInDialog
              open={checkInOpen}
              onOpenChange={setCheckInOpen}
              assignmentId={activeAssignment._id}
              ownerName={displayName}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
