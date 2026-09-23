"use client";

import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import {
  AlertTriangle,
  Calendar,
  ClipboardPenLine,
  HeartHandshake,
  Loader2,
  ShieldAlert,
  UserRoundCog,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  PERMISSIONS,
  RM_ASSIGNMENT_STATUS,
  RM_ASSIGNMENT_STATUS_LABELS,
} from "../../../../../lib/constants";
import { formatRelativeTime } from "../../../../../lib/dates";
import { CheckInDialog } from "@/components/admin/rm/CheckInDialog";
import { ReassignRmDialog } from "@/components/admin/rm/ReassignRmDialog";
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

const RM_STATUS_BADGE_CLASS: Record<string, string> = {
  [RM_ASSIGNMENT_STATUS.ACTIVE]: "border-green-200 bg-green-50 text-green-700",
  [RM_ASSIGNMENT_STATUS.WARNING]: "border-amber-200 bg-amber-50 text-amber-700",
  [RM_ASSIGNMENT_STATUS.ESCALATED]: "border-red-200 bg-red-50 text-red-700",
  [RM_ASSIGNMENT_STATUS.REASSIGNED]: "border-slate-200 bg-slate-100 text-slate-600",
  [RM_ASSIGNMENT_STATUS.ENDED]: "border-slate-200 bg-slate-100 text-slate-600",
};

const STATUS_FILTER_OPTIONS = [
  { label: "All Active", value: "ALL" },
  { label: "Active", value: RM_ASSIGNMENT_STATUS.ACTIVE },
  { label: "Warning", value: RM_ASSIGNMENT_STATUS.WARNING },
  { label: "Escalated", value: RM_ASSIGNMENT_STATUS.ESCALATED },
] as const;

const DUE_WINDOW_OPTIONS = [
  { label: "All Due Windows", value: "ALL" },
  { label: "Overdue", value: "OVERDUE" },
  { label: "Due in 7 days", value: "DUE_7_DAYS" },
  { label: "Due in 30 days", value: "DUE_30_DAYS" },
] as const;

type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number]["value"];
type DueWindowFilter = (typeof DUE_WINDOW_OPTIONS)[number]["value"];

type ReassignTarget = {
  assignmentId: Id<"owner_rm_assignments">;
  ownerName: string;
  currentRmName: string;
};

type CheckInTarget = {
  assignmentId: Id<"owner_rm_assignments">;
  ownerName: string;
};

function formatDueDate(dueMs: number | undefined): string {
  if (!dueMs) return "\u2014";
  const now = Date.now();
  const diff = dueMs - now;
  if (diff < 0) {
    const overdueDays = Math.ceil(Math.abs(diff) / 86_400_000);
    return `${overdueDays}d overdue`;
  }
  const daysLeft = Math.ceil(diff / 86_400_000);
  if (daysLeft === 0) return "Today";
  if (daysLeft === 1) return "Tomorrow";
  return `in ${daysLeft}d`;
}

function isDueOverdue(dueMs: number | undefined): boolean {
  if (!dueMs) return false;
  return dueMs < Date.now();
}

function OwnerNameLink({ ownerId }: { ownerId: Id<"owners"> }) {
  const owner = useQuery(api.owners.getOwnerBasicInfo, { id: ownerId });
  const displayName = owner?.name ?? owner?.phone ?? "...";

  return (
    <Link href={`/admin/owners/${ownerId}`} className="font-medium text-slate-900 hover:underline">
      {displayName}
    </Link>
  );
}

function useOwnerName(ownerId: Id<"owners">): string {
  const owner = useQuery(api.owners.getOwnerBasicInfo, { id: ownerId });
  return owner?.name ?? owner?.phone ?? "Owner";
}

type AssignmentDoc = {
  _id: Id<"owner_rm_assignments">;
  owner_id: Id<"owners">;
  rm_guard_id: Id<"guard_profiles">;
  rm_user_id: Id<"users">;
  status: string;
  last_check_in_at?: number;
  next_check_in_due?: number;
  missed_check_ins_count: number;
  sla_breach_count: number;
  _creationTime: number;
};

function AssignmentRow({
  assignment,
  rmName,
  onCheckIn,
}: {
  assignment: AssignmentDoc;
  rmName: string;
  onCheckIn: ((ownerName: string) => void) | null;
}) {
  const ownerName = useOwnerName(assignment.owner_id);

  return (
    <tr className="border-b border-slate-100">
      <td className="py-3 pr-3">
        <OwnerNameLink ownerId={assignment.owner_id} />
      </td>
      <td className="px-3 py-3 text-slate-600">{rmName}</td>
      <td className="px-3 py-3 text-slate-600">
        {assignment.last_check_in_at ? formatRelativeTime(assignment.last_check_in_at) : "\u2014"}
      </td>
      <td className="px-3 py-3">
        <span
          className={
            isDueOverdue(assignment.next_check_in_due)
              ? "font-medium text-red-600"
              : "text-slate-600"
          }
        >
          {formatDueDate(assignment.next_check_in_due)}
        </span>
      </td>
      <td className="px-3 py-3">
        <Badge
          className={
            RM_STATUS_BADGE_CLASS[assignment.status] ??
            "border-slate-200 bg-slate-100 text-slate-600"
          }
        >
          {RM_ASSIGNMENT_STATUS_LABELS[assignment.status] ?? assignment.status}
        </Badge>
      </td>
      <td className="px-3 py-3">
        {onCheckIn ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onCheckIn(ownerName)}
          >
            <ClipboardPenLine className="mr-1 size-3" />
            Check-in
          </Button>
        ) : (
          <span className="text-xs text-slate-400">{"\u2014"}</span>
        )}
      </td>
    </tr>
  );
}

function EscalationRow({
  assignment,
  rmName,
  onReassign,
}: {
  assignment: AssignmentDoc;
  rmName: string;
  onReassign: ((ownerName: string) => void) | null;
}) {
  const ownerName = useOwnerName(assignment.owner_id);

  return (
    <tr className="border-b border-slate-100">
      <td className="py-3 pr-3">
        <OwnerNameLink ownerId={assignment.owner_id} />
      </td>
      <td className="px-3 py-3 text-slate-600">{rmName}</td>
      <td className="px-3 py-3">
        <Badge
          className={
            RM_STATUS_BADGE_CLASS[assignment.status] ??
            "border-slate-200 bg-slate-100 text-slate-600"
          }
        >
          {RM_ASSIGNMENT_STATUS_LABELS[assignment.status] ?? assignment.status}
        </Badge>
      </td>
      <td className="px-3 py-3 tabular-nums text-slate-600">{assignment.missed_check_ins_count}</td>
      <td className="px-3 py-3 tabular-nums text-slate-600">{assignment.sla_breach_count}</td>
      <td className="px-3 py-3">
        <div className="flex gap-1.5">
          {onReassign ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onReassign(ownerName)}
            >
              <UserRoundCog className="mr-1 size-3" />
              Reassign
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
            <Link href={`/admin/owners/${assignment.owner_id}`}>View Owner</Link>
          </Button>
        </div>
      </td>
    </tr>
  );
}

function UpcomingRow({
  assignment,
  rmName,
  onCheckIn,
}: {
  assignment: AssignmentDoc;
  rmName: string;
  onCheckIn: ((ownerName: string) => void) | null;
}) {
  const ownerName = useOwnerName(assignment.owner_id);

  return (
    <tr className="border-b border-slate-100">
      <td className="py-3 pr-3">
        <OwnerNameLink ownerId={assignment.owner_id} />
      </td>
      <td className="px-3 py-3 text-slate-600">{rmName}</td>
      <td className="px-3 py-3">
        <span
          className={
            isDueOverdue(assignment.next_check_in_due)
              ? "font-medium text-red-600"
              : "text-slate-600"
          }
        >
          {formatDueDate(assignment.next_check_in_due)}
        </span>
      </td>
      <td className="px-3 py-3 text-slate-600">
        {assignment.last_check_in_at ? formatRelativeTime(assignment.last_check_in_at) : "\u2014"}
      </td>
      <td className="px-3 py-3">
        {onCheckIn ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onCheckIn(ownerName)}
          >
            <ClipboardPenLine className="mr-1 size-3" />
            Log Check-in
          </Button>
        ) : (
          <span className="text-xs text-slate-400">{"\u2014"}</span>
        )}
      </td>
    </tr>
  );
}

export default function RmDashboardPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [rmFilter, setRmFilter] = useState("ALL");
  const [dueWindowFilter, setDueWindowFilter] = useState<DueWindowFilter>("ALL");
  const [reassignTarget, setReassignTarget] = useState<ReassignTarget | null>(null);
  const [checkInTarget, setCheckInTarget] = useState<CheckInTarget | null>(null);
  const [nowMs] = useState(() => Date.now());

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

  const hasRmView = permissionSet.has(PERMISSIONS.RM_VIEW);
  const hasRmCheckIn = permissionSet.has(PERMISSIONS.RM_CHECK_IN);
  const hasRmReassign = permissionSet.has(PERMISSIONS.RM_REASSIGN);
  const hasGuardsView = permissionSet.has(PERMISSIONS.GUARDS_VIEW);
  const canLogCheckIn = hasRmCheckIn;
  const canReassignRm = hasRmReassign && hasGuardsView;

  const guards = useQuery(api.guards.list, hasGuardsView ? {} : "skip");

  const guardNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (!guards) return map;
    for (const guard of guards) {
      map[guard.guard_profile_id] = guard.name;
    }
    return map;
  }, [guards]);

  const selectedStatus = statusFilter === "ALL" ? undefined : statusFilter;
  const selectedRm = rmFilter === "ALL" ? undefined : (rmFilter as Id<"guard_profiles">);
  const selectedDueWindow = dueWindowFilter === "ALL" ? undefined : dueWindowFilter;

  const {
    results: assignments,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(
    api.rmAssignments.listActive,
    hasRmView
      ? {
          status_filter: selectedStatus,
          rm_guard_id: selectedRm,
          due_window: selectedDueWindow,
        }
      : "skip",
    { initialNumItems: 50 },
  );

  if (currentUser === undefined || roleAssignments === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) return null;

  if (!hasRmView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view RM operations.
      </div>
    );
  }

  const filteredAssignments = assignments ?? [];

  const totalActive = filteredAssignments.length;
  const warningCount = filteredAssignments.filter(
    (a) => a.status === RM_ASSIGNMENT_STATUS.WARNING,
  ).length;
  const escalatedCount = filteredAssignments.filter(
    (a) => a.status === RM_ASSIGNMENT_STATUS.ESCALATED,
  ).length;
  const weekFromNow = nowMs + 7 * 86_400_000;
  const dueThisWeek = filteredAssignments.filter((a) => {
    if (!a.next_check_in_due) return false;
    return a.next_check_in_due <= weekFromNow;
  }).length;

  const escalationQueue = filteredAssignments.filter(
    (a) => a.status === RM_ASSIGNMENT_STATUS.WARNING || a.status === RM_ASSIGNMENT_STATUS.ESCALATED,
  );

  const upcomingCheckIns = [...filteredAssignments]
    .filter((a) => a.next_check_in_due !== undefined)
    .sort((a, b) => (a.next_check_in_due ?? 0) - (b.next_check_in_due ?? 0))
    .slice(0, 20);

  const isLoading = paginationStatus === "LoadingFirstPage";

  function getRmName(guardId: Id<"guard_profiles">): string {
    return guardNameMap[guardId] ?? "Unknown";
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">RM Dashboard</h2>
        <p className="text-sm text-slate-600">Relationship manager operations and monitoring.</p>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Active" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={rmFilter} onValueChange={setRmFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All RMs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All RMs</SelectItem>
              {(guards ?? [])
                .filter((g) => g.status === "ACTIVE")
                .map((guard) => (
                  <SelectItem key={guard.guard_profile_id} value={guard.guard_profile_id}>
                    {guard.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Select
            value={dueWindowFilter}
            onValueChange={(v) => setDueWindowFilter(v as DueWindowFilter)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Due Windows" />
            </SelectTrigger>
            <SelectContent>
              {DUE_WINDOW_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Total Active</CardTitle>
              <Users className="size-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums text-slate-900">{totalActive}</p>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-amber-700">In Warning</CardTitle>
              <AlertTriangle className="size-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums text-amber-700">{warningCount}</p>
            </CardContent>
          </Card>

          <Card className="border-red-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-red-700">Escalated</CardTitle>
              <ShieldAlert className="size-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums text-red-700">{escalatedCount}</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Due This Week</CardTitle>
              <Calendar className="size-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums text-slate-900">{dueThisWeek}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HeartHandshake className="size-5 text-slate-500" />
            Active Assignments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center">
              <HeartHandshake className="mx-auto mb-3 size-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">No active RM assignments</p>
              <p className="mt-1 text-sm text-slate-500">
                Assignments are auto-created when closures are confirmed.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3 font-medium">Owner</th>
                    <th className="px-3 py-2.5 font-medium">RM Guard</th>
                    <th className="px-3 py-2.5 font-medium">Last Check-in</th>
                    <th className="px-3 py-2.5 font-medium">Next Due</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignments.map((assignment) => (
                    <AssignmentRow
                      key={assignment._id}
                      assignment={assignment}
                      rmName={getRmName(assignment.rm_guard_id)}
                      onCheckIn={
                        canLogCheckIn
                          ? (ownerName) =>
                              setCheckInTarget({
                                assignmentId: assignment._id,
                                ownerName,
                              })
                          : null
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {paginationStatus === "CanLoadMore" && (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => loadMore(50)}
                className="border-slate-300 text-slate-700"
              >
                Load More
              </Button>
            </div>
          )}
          {paginationStatus === "LoadingMore" && (
            <div className="mt-4 flex justify-center py-4">
              <Loader2 className="size-5 animate-spin text-slate-500" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="size-5 text-red-500" />
            Escalation Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : escalationQueue.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center">
              <p className="text-sm text-slate-500">No escalations at this time.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3 font-medium">Owner</th>
                    <th className="px-3 py-2.5 font-medium">RM</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Missed</th>
                    <th className="px-3 py-2.5 font-medium">SLA Breaches</th>
                    <th className="px-3 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {escalationQueue.map((assignment) => (
                    <EscalationRow
                      key={assignment._id}
                      assignment={assignment}
                      rmName={getRmName(assignment.rm_guard_id)}
                      onReassign={
                        canReassignRm
                          ? (ownerName) =>
                              setReassignTarget({
                                assignmentId: assignment._id,
                                ownerName,
                                currentRmName: getRmName(assignment.rm_guard_id),
                              })
                          : null
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="size-5 text-slate-500" />
            Upcoming Check-ins
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : upcomingCheckIns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center">
              <p className="text-sm text-slate-500">No upcoming check-ins scheduled.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3 font-medium">Owner</th>
                    <th className="px-3 py-2.5 font-medium">RM</th>
                    <th className="px-3 py-2.5 font-medium">Next Due</th>
                    <th className="px-3 py-2.5 font-medium">Last Check-in</th>
                    <th className="px-3 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingCheckIns.map((assignment) => (
                    <UpcomingRow
                      key={assignment._id}
                      assignment={assignment}
                      rmName={getRmName(assignment.rm_guard_id)}
                      onCheckIn={
                        canLogCheckIn
                          ? (ownerName) =>
                              setCheckInTarget({
                                assignmentId: assignment._id,
                                ownerName,
                              })
                          : null
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {canReassignRm && reassignTarget && (
        <ReassignRmDialog
          open={reassignTarget !== null}
          onOpenChange={(open) => {
            if (!open) setReassignTarget(null);
          }}
          assignmentId={reassignTarget.assignmentId}
          ownerName={reassignTarget.ownerName}
          currentRmName={reassignTarget.currentRmName}
        />
      )}

      {canLogCheckIn && checkInTarget && (
        <CheckInDialog
          open={checkInTarget !== null}
          onOpenChange={(open) => {
            if (!open) setCheckInTarget(null);
          }}
          assignmentId={checkInTarget.assignmentId}
          ownerName={checkInTarget.ownerName}
        />
      )}
    </div>
  );
}
