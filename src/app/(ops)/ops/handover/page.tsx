"use client";

import { useQuery } from "convex/react";
import { ClipboardCheck, Inbox, Loader2 } from "lucide-react";
import Link from "next/link";
import { api } from "../../../../../convex/_generated/api";
import {
  CHECKLIST_STATUS,
  CHECKLIST_STATUS_LABELS,
  USER_TYPE,
  type ChecklistStatus,
} from "../../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TARGET_TEMPLATE_NAME = "Move-in Handover";

const STATUS_STYLES: Record<ChecklistStatus, string> = {
  [CHECKLIST_STATUS.ASSIGNED]: "border-blue-300 bg-blue-50 text-blue-700",
  [CHECKLIST_STATUS.IN_PROGRESS]: "border-emerald-300 bg-emerald-50 text-emerald-700",
  [CHECKLIST_STATUS.SUBMITTED]: "border-indigo-300 bg-indigo-50 text-indigo-700",
  [CHECKLIST_STATUS.UNDER_REVIEW]: "border-amber-300 bg-amber-50 text-amber-700",
  [CHECKLIST_STATUS.APPROVED]: "border-emerald-300 bg-emerald-50 text-emerald-700",
  [CHECKLIST_STATUS.REJECTED]: "border-red-300 bg-red-50 text-red-700",
  [CHECKLIST_STATUS.REVISION_REQUESTED]: "border-orange-300 bg-orange-50 text-orange-700",
};

function formatVisitTime(value: number | undefined): string {
  if (!value) {
    return "Schedule unavailable";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export default function OpsHandoverListPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const checklists = useQuery(api.checklists.listForReview, { limit: 100 });

  if (currentUser === undefined || checklists === undefined) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-7 animate-spin text-slate-400" />
      </div>
    );
  }

  if (
    !currentUser ||
    !(currentUser.user_types?.includes(USER_TYPE.OPS) ?? currentUser.user_type === USER_TYPE.OPS)
  ) {
    return null;
  }

  const handoverChecklists = checklists.filter(
    (instance) =>
      instance.template?.name === TARGET_TEMPLATE_NAME &&
      instance.assigned_to === currentUser._id &&
      instance.is_deleted !== true,
  );

  return (
    <div className="space-y-4 text-base">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-slate-900">Move-in Handover</h1>
        <p className="text-sm text-slate-500">
          Complete assigned handover checklists before closure.
        </p>
      </div>

      <div className="space-y-2.5">
        {handoverChecklists.map((instance) => (
          <Link
            key={instance._id}
            href={`/ops/handover/${instance._id}`}
            className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  Checklist #{String(instance._id).slice(-6)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Visit: {formatVisitTime(instance.visit?.scheduled_start)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Completeness: <span className="font-mono">{instance.completeness_score}%</span>
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn("font-semibold", STATUS_STYLES[instance.status as ChecklistStatus])}
              >
                {CHECKLIST_STATUS_LABELS[instance.status as ChecklistStatus]}
              </Badge>
            </div>
          </Link>
        ))}
      </div>

      {handoverChecklists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          <Inbox className="mx-auto mb-2 size-9 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No assigned handover checklists</p>
          <p className="mt-1 text-xs text-slate-500">
            Ask admin to assign a Move-in Handover checklist to your OPS account.
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <ClipboardCheck className="size-3.5" />
        Showing {handoverChecklists.length} handover checklist
        {handoverChecklists.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
