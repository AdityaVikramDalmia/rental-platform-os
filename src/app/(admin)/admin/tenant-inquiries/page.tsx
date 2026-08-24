"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  PERMISSIONS,
  TENANT_INQUIRY_STATUS,
  type TenantInquiryStatus,
} from "../../../../../lib/constants";
import { isValidConvexId } from "../../../../../lib/validators";
import { InquiryDetailPanel } from "./components/inquiry-detail-panel";
import { InquiryStatusTabs } from "./components/inquiry-status-tabs";
import { InquiryTable } from "./components/inquiry-table";

const TAB_STATUSES: TenantInquiryStatus[] = [
  TENANT_INQUIRY_STATUS.SUBMITTED,
  TENANT_INQUIRY_STATUS.REVIEWED,
  TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
  TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
  TENANT_INQUIRY_STATUS.VISIT_SCHEDULED,
  TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
  TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
  TENANT_INQUIRY_STATUS.CLOSED,
  TENANT_INQUIRY_STATUS.REJECTED,
  TENANT_INQUIRY_STATUS.EXPIRED,
];

const VALID_TAB_STATUSES = new Set<string>(TAB_STATUSES);

function parseStatusParam(param: string | null): TenantInquiryStatus | null {
  if (param && VALID_TAB_STATUSES.has(param)) {
    return param as TenantInquiryStatus;
  }
  return null;
}

export default function TenantInquiriesPage() {
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

  const hasTenantInquiriesView = permissionSet.has(PERMISSIONS.TENANT_INQUIRIES_VIEW);
  const canReview = permissionSet.has(PERMISSIONS.TENANT_INQUIRIES_MANAGE);
  const activeStatus = parseStatusParam(searchParams.get("status"));

  const inquiryIdParam = searchParams.get("id");
  const selectedInquiryFromQuery =
    inquiryIdParam && isValidConvexId(inquiryIdParam)
      ? (inquiryIdParam as Id<"tenant_inquiries">)
      : null;

  const [selectedInquiryId, setSelectedInquiryId] = useState<Id<"tenant_inquiries"> | null>(null);

  useEffect(() => {
    setSelectedInquiryId(selectedInquiryFromQuery);
  }, [selectedInquiryFromQuery]);

  const handleStatusChange = useCallback(
    (status: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (status) {
        params.set("status", status);
      } else {
        params.delete("status");
      }
      params.delete("id");

      const query = params.toString();
      router.replace(query ? `/admin/tenant-inquiries?${query}` : "/admin/tenant-inquiries", {
        scroll: false,
      });
      setSelectedInquiryId(null);
    },
    [router, searchParams],
  );

  const handleSelectInquiry = useCallback(
    (id: Id<"tenant_inquiries"> | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) {
        params.set("id", id);
      } else {
        params.delete("id");
      }

      const query = params.toString();
      router.replace(query ? `/admin/tenant-inquiries?${query}` : "/admin/tenant-inquiries", {
        scroll: false,
      });
      setSelectedInquiryId(id);
    },
    [router, searchParams],
  );

  if (currentUser === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) { return null; }

  if (!hasTenantInquiriesView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view tenant inquiries.
      </div>
    );
  }

  return (
    <TenantInquiriesView
      activeStatus={activeStatus}
      selectedInquiryId={selectedInquiryId}
      onStatusChange={handleStatusChange}
      onSelectInquiry={handleSelectInquiry}
      canReview={canReview}
    />
  );
}

type TenantInquiriesViewProps = {
  activeStatus: TenantInquiryStatus | null;
  selectedInquiryId: Id<"tenant_inquiries"> | null;
  onStatusChange: (status: string | null) => void;
  onSelectInquiry: (id: Id<"tenant_inquiries"> | null) => void;
  canReview: boolean;
};

function TenantInquiriesView({
  activeStatus,
  selectedInquiryId,
  onStatusChange,
  onSelectInquiry,
  canReview,
}: TenantInquiriesViewProps) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.tenantInquiries.list,
    { status: activeStatus || undefined },
    { initialNumItems: 20 },
  );

  const counts = useQuery(api.tenantInquiries.getStatusCounts);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Tenant Inquiries</h2>
        <p className="text-sm text-slate-600">
          Review visit requests, post bounties for guards, and track the inquiry pipeline.
        </p>
      </div>

      <InquiryStatusTabs
        activeStatus={activeStatus}
        onStatusChange={onStatusChange}
        counts={counts}
      />

      <InquiryTable
        data={results}
        selectedId={selectedInquiryId}
        onSelect={onSelectInquiry}
        loadMore={() => loadMore(20)}
        status={status}
      />

      <InquiryDetailPanel
        inquiryId={selectedInquiryId}
        onClose={() => onSelectInquiry(null)}
        canReview={canReview}
      />
    </div>
  );
}
