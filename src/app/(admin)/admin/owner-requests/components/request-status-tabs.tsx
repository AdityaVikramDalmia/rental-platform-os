"use client";

import {
  OWNER_SERVICE_REQUEST_STATUS,
  OWNER_SERVICE_REQUEST_STATUS_COLORS,
  type OwnerServiceRequestStatus,
} from "../../../../../../lib/constants";
import { cn } from "@/lib/utils";

type RequestStatusTabsProps = {
  activeStatus: OwnerServiceRequestStatus | "ALL";
  onStatusChange: (status: OwnerServiceRequestStatus | "ALL") => void;
  counts: Partial<Record<OwnerServiceRequestStatus, number>>;
};

const TABS = [
  { label: "All", value: "ALL" as const },
  { label: "Submitted", value: OWNER_SERVICE_REQUEST_STATUS.SUBMITTED },
  { label: "Contacted", value: OWNER_SERVICE_REQUEST_STATUS.CONTACTED },
  { label: "Onboarded", value: OWNER_SERVICE_REQUEST_STATUS.ONBOARDED },
  { label: "Active", value: OWNER_SERVICE_REQUEST_STATUS.ACTIVE },
  { label: "Rejected", value: OWNER_SERVICE_REQUEST_STATUS.REJECTED },
  { label: "Dropped", value: OWNER_SERVICE_REQUEST_STATUS.DROPPED },
] as const;

export function RequestStatusTabs({
  activeStatus,
  onStatusChange,
  counts,
}: RequestStatusTabsProps) {
  const totalCount = Object.values(OWNER_SERVICE_REQUEST_STATUS).reduce(
    (sum, status) => sum + (counts[status] ?? 0),
    0,
  );

  return (
    <div className="flex gap-1 overflow-x-auto py-2">
      {TABS.map((tab) => {
        const count = tab.value === "ALL" ? totalCount : (counts[tab.value] ?? 0);
        const isActive = activeStatus === tab.value;

        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onStatusChange(tab.value)}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs font-semibold",
                isActive
                  ? "bg-white/20 text-white"
                  : tab.value === "ALL"
                    ? "bg-slate-100 text-slate-700"
                    : OWNER_SERVICE_REQUEST_STATUS_COLORS[tab.value],
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
