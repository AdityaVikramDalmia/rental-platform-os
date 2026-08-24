"use client";

import { SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  CHECKLIST_DEPTH_LABELS,
  CHECKLIST_STATUS,
  CHECKLIST_STATUS_LABELS,
  type ChecklistDepth,
  type ChecklistStatus,
} from "../../../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const PAGE_SIZE = 20;
export const ALL_ASSIGNEES_VALUE = "__all__" as const;

const STATUS_BADGE_STYLES: Record<ChecklistStatus, string> = {
  [CHECKLIST_STATUS.ASSIGNED]: "border-slate-200 bg-slate-100 text-slate-700",
  [CHECKLIST_STATUS.IN_PROGRESS]: "border-indigo-200 bg-indigo-100 text-indigo-700",
  [CHECKLIST_STATUS.SUBMITTED]: "border-blue-200 bg-blue-100 text-blue-700",
  [CHECKLIST_STATUS.UNDER_REVIEW]: "border-amber-200 bg-amber-100 text-amber-700",
  [CHECKLIST_STATUS.REVISION_REQUESTED]: "border-orange-200 bg-orange-100 text-orange-700",
  [CHECKLIST_STATUS.APPROVED]: "border-emerald-200 bg-emerald-100 text-emerald-700",
  [CHECKLIST_STATUS.REJECTED]: "border-red-200 bg-red-100 text-red-700",
};

export type ChecklistReviewListItem = {
  _id: Id<"checklist_instances">;
  _creationTime: number;
  visit_id: Id<"visits">;
  assigned_to: Id<"users">;
  depth: ChecklistDepth;
  status: ChecklistStatus;
  completeness_score: number;
  submitted_at?: number;
  assigned_user: {
    _id: Id<"users">;
    name: string;
    phone?: string;
  } | null;
  visit: {
    _id: Id<"visits">;
    status: string;
    scheduled_start: number;
    scheduled_end: number;
  } | null;
};

type ChecklistReviewTableProps = {
  checklists: ChecklistReviewListItem[];
  selectedAssignee: Id<"users"> | typeof ALL_ASSIGNEES_VALUE;
  onAssigneeChange: (value: Id<"users"> | typeof ALL_ASSIGNEES_VALUE) => void;
  onSelectChecklist: (checklist: ChecklistReviewListItem) => void;
};

export function ChecklistReviewTable({
  checklists,
  selectedAssignee,
  onAssigneeChange,
  onSelectChecklist,
}: ChecklistReviewTableProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [prevResetKey, setPrevResetKey] = useState({ selectedAssignee, checklists });

  // Reset pagination when the assignee filter or the underlying list changes.
  // Adjusting state during render (rather than in an effect) avoids an extra
  // commit-then-effect-then-recommit render cascade.
  if (prevResetKey.selectedAssignee !== selectedAssignee || prevResetKey.checklists !== checklists) {
    setPrevResetKey({ selectedAssignee, checklists });
    setVisibleCount(PAGE_SIZE);
  }

  const assigneeOptions = useMemo(() => {
    const options = new Map<string, { id: Id<"users">; name: string }>();

    for (const checklist of checklists) {
      if (!checklist.assigned_user) {
        continue;
      }

      options.set(checklist.assigned_user._id, {
        id: checklist.assigned_user._id,
        name: checklist.assigned_user.name,
      });
    }

    return Array.from(options.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [checklists]);

  const sortedChecklists = useMemo(() => {
    return [...checklists].sort((a, b) => {
      const aSubmittedAt = a.submitted_at ?? a._creationTime;
      const bSubmittedAt = b.submitted_at ?? b._creationTime;
      return bSubmittedAt - aSubmittedAt;
    });
  }, [checklists]);

  const filteredChecklists = useMemo(() => {
    if (selectedAssignee === ALL_ASSIGNEES_VALUE) {
      return sortedChecklists;
    }

    return sortedChecklists.filter((item) => item.assigned_to === selectedAssignee);
  }, [selectedAssignee, sortedChecklists]);

  const visibleRows = filteredChecklists.slice(0, visibleCount);
  const canLoadMore = filteredChecklists.length > visibleRows.length;

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedAssignee}
              onValueChange={(value) =>
                onAssigneeChange(value as Id<"users"> | typeof ALL_ASSIGNEES_VALUE)
              }
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All Assignees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ASSIGNEES_VALUE}>All Assignees</SelectItem>
                {assigneeOptions.map((assignee) => (
                  <SelectItem key={assignee.id} value={assignee.id}>
                    {assignee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-sm text-slate-500">Showing {visibleRows.length} review items</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-2.5 font-medium">Visit ID</th>
                <th className="px-3 py-2.5 font-medium">Assigned Guard</th>
                <th className="px-3 py-2.5 font-medium">Depth</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Completeness Score</th>
                <th className="px-3 py-2.5 font-medium">Submitted At</th>
                <th className="px-3 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((checklist) => {
                const submittedAt = checklist.submitted_at ?? checklist._creationTime;

                return (
                  <tr
                    key={checklist._id}
                    className="cursor-pointer border-b border-slate-100 text-slate-800 transition-colors hover:bg-slate-50"
                    onClick={() => onSelectChecklist(checklist)}
                  >
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">
                      {(checklist.visit?._id ?? checklist.visit_id).slice(0, 8)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {checklist.assigned_user?.name ?? "Unassigned"}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {CHECKLIST_DEPTH_LABELS[checklist.depth]}
                    </td>
                    <td className="px-3 py-3">
                      <Badge className={STATUS_BADGE_STYLES[checklist.status]}>
                        {CHECKLIST_STATUS_LABELS[checklist.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-800">
                      {checklist.completeness_score}%
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {DATE_FORMATTER.format(submittedAt)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectChecklist(checklist);
                        }}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredChecklists.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <SearchX className="size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No checklist reviews found</p>
            <p className="text-sm text-slate-500">Try changing the status or assignee filter.</p>
          </div>
        ) : null}

        {canLoadMore ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => setVisibleCount((previous) => previous + PAGE_SIZE)}
              className="border-slate-300 text-slate-700"
            >
              Load More
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
