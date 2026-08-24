"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PERMISSIONS } from "../../../../../lib/constants";
import { AuditFilterBar } from "./components/audit-filter-bar";
import { AuditTable } from "./components/audit-table";

function parseDateParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function AuditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const hasAuditView = permissionSet.has(PERMISSIONS.AUDIT_VIEW);

  const actorParam = searchParams.get("actor");
  const actionParam = searchParams.get("action");
  const entityTypeParam = searchParams.get("entity_type");
  const entityIdParam = searchParams.get("entity_id");
  const dateFromParam = searchParams.get("date_from");
  const dateToParam = searchParams.get("date_to");

  const dateFromFilter = parseDateParam(dateFromParam);
  const dateToFilter = parseDateParam(dateToParam);

  const updateFilters = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.replace(`/admin/audit?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const queryArgs: {
    actor_user_id?: Id<"users">;
    actor_type?: string;
    action?: string;
    entity_type?: string;
    entity_id?: string;
    date_from?: number;
    date_to?: number;
  } = {};

  if (actorParam) {
    if (actorParam === "__system__") {
      queryArgs.actor_type = "SYSTEM";
    } else {
      queryArgs.actor_user_id = actorParam as Id<"users">;
    }
  }
  if (actionParam) queryArgs.action = actionParam;
  if (entityTypeParam) queryArgs.entity_type = entityTypeParam;
  if (entityIdParam) queryArgs.entity_id = entityIdParam;
  if (dateFromFilter) queryArgs.date_from = dateFromFilter;
  if (dateToFilter) queryArgs.date_to = dateToFilter;

  const { results, status, loadMore } = usePaginatedQuery(api.auditLogs.list, queryArgs, {
    initialNumItems: 20,
  });

  if (currentUser === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) { return null; }

  if (!hasAuditView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view audit logs.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Audit Log</h2>
        <p className="text-sm text-slate-600">Full history of all platform actions.</p>
      </div>

      <AuditFilterBar
        actor={actorParam ?? undefined}
        action={actionParam ?? undefined}
        entityType={entityTypeParam ?? undefined}
        entityId={entityIdParam ?? undefined}
        dateFrom={dateFromFilter}
        dateTo={dateToFilter}
        onFilterChange={updateFilters}
      />

      <AuditTable entries={results} status={status} onLoadMore={() => loadMore(20)} />
    </div>
  );
}
