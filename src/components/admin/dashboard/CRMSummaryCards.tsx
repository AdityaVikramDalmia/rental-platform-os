"use client";

import { useQuery } from "convex/react";
import { Building2, MessageSquare, Users } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import {
  OWNER_SERVICE_REQUEST_STATUS,
  SUPPORT_INQUIRY_STATUS,
  TENANT_INQUIRY_STATUS,
} from "../../../../lib/constants";
import { CRMStatCard } from "@/components/admin/crm-stat-card";

function sumCounts(counts: Record<string, number> | undefined): number | undefined {
  if (!counts) {
    return undefined;
  }

  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function sumSelectedCounts(
  counts: Record<string, number> | undefined,
  keys: ReadonlyArray<string>,
): number | undefined {
  if (!counts) {
    return undefined;
  }

  return keys.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

export function CRMSummaryCards() {
  const tenantCounts = useQuery(api.tenantInquiries.getStatusCounts);
  const ownerCounts = useQuery(api.ownerServiceRequests.getStatusCounts);
  const supportCounts = useQuery(api.supportInquiries.getStatusCounts);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <CRMStatCard
        href="/admin/tenant-inquiries"
        label="Tenant Inquiries"
        totalCount={sumCounts(tenantCounts)}
        needsAttentionCount={sumSelectedCounts(tenantCounts, [
          TENANT_INQUIRY_STATUS.SUBMITTED,
          TENANT_INQUIRY_STATUS.REVIEWED,
          TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
        ])}
        description="Total inquiries"
        icon={Users}
      />

      <CRMStatCard
        href="/admin/owner-requests"
        label="Owner Requests"
        totalCount={sumCounts(ownerCounts)}
        needsAttentionCount={sumSelectedCounts(ownerCounts, [
          OWNER_SERVICE_REQUEST_STATUS.SUBMITTED,
          OWNER_SERVICE_REQUEST_STATUS.CONTACTED,
        ])}
        description="Total requests"
        icon={Building2}
      />

      <CRMStatCard
        href="/admin/support"
        label="Support Inquiries"
        totalCount={sumCounts(supportCounts)}
        needsAttentionCount={sumSelectedCounts(supportCounts, [
          SUPPORT_INQUIRY_STATUS.OPEN,
          SUPPORT_INQUIRY_STATUS.IN_PROGRESS,
        ])}
        description="Total support tickets"
        icon={MessageSquare}
      />
    </div>
  );
}
