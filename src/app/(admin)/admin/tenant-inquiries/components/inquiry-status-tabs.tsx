"use client";

import { TENANT_INQUIRY_STATUS, type TenantInquiryStatus } from "../../../../../../lib/constants";
import { cn } from "@/lib/utils";

type StatusTab = {
  label: string;
  value: TenantInquiryStatus | null;
  badgeClass: string;
};

const STATUS_TABS: StatusTab[] = [
  { label: "All", value: null, badgeClass: "" },
  {
    label: "Submitted",
    value: TENANT_INQUIRY_STATUS.SUBMITTED,
    badgeClass: "bg-blue-100 text-blue-700",
  },
  {
    label: "Reviewed",
    value: TENANT_INQUIRY_STATUS.REVIEWED,
    badgeClass: "bg-indigo-100 text-indigo-700",
  },
  {
    label: "Bounty",
    value: TENANT_INQUIRY_STATUS.BOUNTY_POSTED,
    badgeClass: "bg-amber-100 text-amber-700",
  },
  {
    label: "Accepted",
    value: TENANT_INQUIRY_STATUS.GUARD_ACCEPTED,
    badgeClass: "bg-cyan-100 text-cyan-700",
  },
  {
    label: "Scheduled",
    value: TENANT_INQUIRY_STATUS.VISIT_SCHEDULED,
    badgeClass: "bg-purple-100 text-purple-700",
  },
  {
    label: "Completed",
    value: TENANT_INQUIRY_STATUS.VISIT_COMPLETED,
    badgeClass: "bg-green-100 text-green-700",
  },
  {
    label: "Negotiation",
    value: TENANT_INQUIRY_STATUS.NEGOTIATION_INITIATED,
    badgeClass: "bg-violet-100 text-violet-700",
  },
  {
    label: "Closed",
    value: TENANT_INQUIRY_STATUS.CLOSED,
    badgeClass: "bg-gray-100 text-gray-600",
  },
  {
    label: "Rejected",
    value: TENANT_INQUIRY_STATUS.REJECTED,
    badgeClass: "bg-red-100 text-red-700",
  },
  {
    label: "Expired",
    value: TENANT_INQUIRY_STATUS.EXPIRED,
    badgeClass: "bg-orange-100 text-orange-700",
  },
];

type InquiryStatusTabsProps = {
  activeStatus: string | null;
  onStatusChange: (status: string | null) => void;
  counts: Record<string, number> | undefined;
};

export function InquiryStatusTabs({
  activeStatus,
  onStatusChange,
  counts,
}: InquiryStatusTabsProps) {
  const totalCount = counts ? Object.values(counts).reduce((sum, count) => sum + count, 0) : 0;

  function getCount(status: TenantInquiryStatus | null): number {
    if (!counts) return 0;
    if (!status) return totalCount;
    return counts[status] ?? 0;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {STATUS_TABS.map((tab) => {
        const isActive = activeStatus === tab.value;
        const count = getCount(tab.value);

        return (
          <button
            key={tab.label}
            type="button"
            onClick={() => onStatusChange(tab.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            {tab.label}
            {counts !== undefined && (
              <span
                className={cn(
                  "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                  isActive
                    ? "bg-white/20 text-white"
                    : tab.badgeClass || "bg-slate-100 text-slate-500",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
