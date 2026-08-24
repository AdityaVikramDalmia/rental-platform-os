"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  OWNER_SERVICE_REQUEST_STATUS,
  PERMISSIONS,
  type OwnerServiceRequestStatus,
} from "../../../../../lib/constants";
import { isValidConvexId } from "../../../../../lib/validators";
import { RequestDetailPanel } from "./components/request-detail-panel";
import { RequestStatusTabs } from "./components/request-status-tabs";
import { RequestTable } from "./components/request-table";

const VALID_STATUSES = new Set<string>(Object.values(OWNER_SERVICE_REQUEST_STATUS));

function parseStatusParam(param: string | null): OwnerServiceRequestStatus | "ALL" {
  if (!param || param === "ALL") {
    return "ALL";
  }
  if (VALID_STATUSES.has(param)) {
    return param as OwnerServiceRequestStatus;
  }
  return "ALL";
}

export default function OwnerRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const hasView = permissionSet.has(PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW);
  const canManage = permissionSet.has(PERMISSIONS.OWNER_SERVICE_REQUESTS_MANAGE);

  const statusFilter = parseStatusParam(searchParams.get("status"));
  const requestIdParam = searchParams.get("id");
  const selectedId =
    requestIdParam && isValidConvexId(requestIdParam)
      ? (requestIdParam as Id<"owner_service_requests">)
      : null;

  const statusCounts = useQuery(api.ownerServiceRequests.getStatusCounts, hasView ? {} : "skip");

  const setStatus = useCallback(
    (status: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (status === "ALL") {
        params.delete("status");
      } else {
        params.set("status", status);
      }
      params.delete("id");

      const query = params.toString();
      router.replace(query ? `/admin/owner-requests?${query}` : "/admin/owner-requests", {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const setSelectedId = useCallback(
    (id: Id<"owner_service_requests"> | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) {
        params.set("id", id);
      } else {
        params.delete("id");
      }

      const query = params.toString();
      router.replace(query ? `/admin/owner-requests?${query}` : "/admin/owner-requests", {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  if (currentUser === undefined || roleAssignments === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) { return null; }

  if (!hasView) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        You do not have permission to view owner requests.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Owner Requests</h2>
        <p className="text-sm text-slate-600">
          Review property owner service requests, contact owners, and manage onboarding.
        </p>
      </div>

      <div className="border-b border-slate-200 bg-white px-6">
        <RequestStatusTabs
          activeStatus={statusFilter}
          onStatusChange={setStatus}
          counts={statusCounts ?? {}}
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <RequestTable
            statusFilter={statusFilter === "ALL" ? undefined : statusFilter}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {selectedId ? (
          <div className="w-96 overflow-auto border-l border-slate-200">
            <RequestDetailPanel
              requestId={selectedId}
              onClose={() => setSelectedId(null)}
              canManage={canManage}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
