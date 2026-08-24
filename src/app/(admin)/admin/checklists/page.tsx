"use client";

import { useQuery } from "convex/react";
import { Loader2, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  CHECKLIST_STATUS,
  CHECKLIST_STATUS_LABELS,
  PERMISSIONS,
  type ChecklistStatus,
} from "../../../../../lib/constants";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { ChecklistReviewActions } from "./components/checklist-review-actions";
import { ChecklistReviewDetail } from "./components/checklist-review-detail";
import {
  ALL_ASSIGNEES_VALUE,
  ChecklistReviewTable,
  type ChecklistReviewListItem,
} from "./components/checklist-review-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ChecklistStatusTab = "ALL" | ChecklistStatus;

const STATUS_TABS: ReadonlyArray<{
  value: ChecklistStatusTab;
  label: string;
}> = [
  { value: "ALL", label: "All" },
  { value: CHECKLIST_STATUS.SUBMITTED, label: "Submitted" },
  { value: CHECKLIST_STATUS.UNDER_REVIEW, label: "Under Review" },
  { value: CHECKLIST_STATUS.REVISION_REQUESTED, label: "Revision Requested" },
  { value: CHECKLIST_STATUS.APPROVED, label: "Approved" },
  { value: CHECKLIST_STATUS.REJECTED, label: "Rejected" },
];

export default function ChecklistReviewPage() {
  const [activeTab, setActiveTab] = useState<ChecklistStatusTab>(CHECKLIST_STATUS.SUBMITTED);
  const [selectedAssignee, setSelectedAssignee] = useState<
    Id<"users"> | typeof ALL_ASSIGNEES_VALUE
  >(ALL_ASSIGNEES_VALUE);
  const [selectedChecklist, setSelectedChecklist] = useState<ChecklistReviewListItem | null>(null);

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

  const hasChecklistViewPermission = permissionSet.has(PERMISSIONS.VISITS_VIEW);
  const hasChecklistReviewPermission = permissionSet.has(PERMISSIONS.VISITS_EDIT);

  const queueQueryArgs = useMemo(() => {
    const args: {
      status?: ChecklistStatus;
      limit: number;
    } = {
      limit: 200,
    };

    if (activeTab !== "ALL") {
      args.status = activeTab;
    }

    return args;
  }, [activeTab]);

  const reviewQueue = useQuery(
    api.checklists.listForReview,
    hasChecklistViewPermission ? queueQueryArgs : "skip",
  );
  const allReviewItems = useQuery(
    api.checklists.listForReview,
    hasChecklistViewPermission
      ? {
          limit: 200,
        }
      : "skip",
  );

  const tabCounts = useMemo(() => {
    const rows = allReviewItems ?? [];
    const counts: Record<ChecklistStatusTab, number> = {
      ALL: rows.length,
      [CHECKLIST_STATUS.SUBMITTED]: 0,
      [CHECKLIST_STATUS.UNDER_REVIEW]: 0,
      [CHECKLIST_STATUS.REVISION_REQUESTED]: 0,
      [CHECKLIST_STATUS.APPROVED]: 0,
      [CHECKLIST_STATUS.REJECTED]: 0,
      [CHECKLIST_STATUS.ASSIGNED]: 0,
      [CHECKLIST_STATUS.IN_PROGRESS]: 0,
    };

    for (const row of rows) {
      counts[row.status] += 1;
    }

    return counts;
  }, [allReviewItems]);

  if (currentUser === undefined || roleAssignments === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) { return null; }

  if (!hasChecklistViewPermission) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-16 text-center">
        <ShieldAlert className="size-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Access Denied</p>
        <p className="text-sm text-slate-500">You do not have permission to review checklists.</p>
      </div>
    );
  }

  if (reviewQueue === undefined || allReviewItems === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Breadcrumb
          items={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Checklists" }]}
        />

        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Checklist Reviews
          </h2>
          <p className="text-sm text-slate-600">
            Review submitted checklist responses, inspect photo evidence, and record decision notes.
          </p>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as ChecklistStatusTab);
          setSelectedAssignee(ALL_ASSIGNEES_VALUE);
          setSelectedChecklist(null);
        }}
        className="space-y-4"
      >
        <TabsList className="h-auto flex-wrap items-center justify-start rounded-xl border border-slate-200 bg-white p-1">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-2 px-3 py-2">
              <span>{tab.label}</span>
              <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-500">
                {tabCounts[tab.value]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <ChecklistReviewTable
          checklists={reviewQueue as ChecklistReviewListItem[]}
          selectedAssignee={selectedAssignee}
          onAssigneeChange={setSelectedAssignee}
          onSelectChecklist={setSelectedChecklist}
        />
      </Tabs>

      <Dialog
        open={selectedChecklist !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedChecklist(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-6xl">
          {selectedChecklist ? (
            <div className="flex h-full max-h-[92vh] flex-col">
              <DialogHeader className="border-b border-slate-200 px-6 py-4">
                <DialogTitle>Checklist #{selectedChecklist._id.slice(0, 8)}</DialogTitle>
                <DialogDescription>
                  Visit #{(selectedChecklist.visit?._id ?? selectedChecklist.visit_id).slice(0, 8)}{" "}
                  • {CHECKLIST_STATUS_LABELS[selectedChecklist.status as ChecklistStatus]}
                </DialogDescription>
              </DialogHeader>

              <div className="grid flex-1 gap-4 overflow-y-auto px-6 py-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <ChecklistReviewDetail checklistId={selectedChecklist._id} />

                <div className="h-fit space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Review Actions</h3>
                  {hasChecklistReviewPermission ? (
                    <ChecklistReviewActions
                      checklistId={selectedChecklist._id}
                      currentStatus={selectedChecklist.status}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">
                      You do not have permission to submit checklist review decisions.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
