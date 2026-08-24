"use client";

import { usePaginatedQuery } from "convex/react";
import { FileText, Loader2 } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  SUPPORT_INQUIRY_STATUS_COLORS,
  SUPPORT_INQUIRY_STATUS_LABELS,
  type SupportInquiryStatus,
} from "../../../../../../lib/constants";
import { formatDateTime, formatRelativeTime } from "../../../../../../lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type InquiryTableProps = {
  statusFilter: SupportInquiryStatus | undefined;
  personaTypeFilter: "TENANT" | "OWNER" | "GUARD" | "OTHER" | undefined;
  assignedAdminFilter: Id<"users"> | undefined;
  preferredContactMethodFilter: "EMAIL" | "PHONE" | "WHATSAPP" | "IN_APP" | undefined;
  selectedId: Id<"support_inquiries"> | null;
  onSelect: (id: Id<"support_inquiries">) => void;
};

const SKELETON_ROW_KEYS = [
  "support-row-1",
  "support-row-2",
  "support-row-3",
  "support-row-4",
] as const;

export function InquiryTable({
  statusFilter,
  personaTypeFilter,
  assignedAdminFilter,
  preferredContactMethodFilter,
  selectedId,
  onSelect,
}: InquiryTableProps) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.supportInquiries.list,
    {
      status: statusFilter,
      persona_type: personaTypeFilter,
      assigned_admin_id: assignedAdminFilter,
      preferred_contact_method: preferredContactMethodFilter,
    },
    { initialNumItems: 20 },
  );

  const isLoading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const isLoadingMore = status === "LoadingMore";

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="w-16 py-2.5 pr-2 font-medium">#</th>
                <th className="w-[22%] px-3 py-2.5 font-medium">Name</th>
                <th className="w-[30%] px-3 py-2.5 font-medium">Subject</th>
                <th className="w-[12%] px-3 py-2.5 font-medium">Persona</th>
                <th className="w-[14%] px-3 py-2.5 font-medium">Status</th>
                <th className="w-[16%] px-3 py-2.5 font-medium">Assigned</th>
                <th className="w-[12%] px-3 py-2.5 font-medium">Created</th>
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? SKELETON_ROW_KEYS.map((key) => (
                    <tr key={key} className="border-b border-slate-100">
                      <td className="py-3 pr-2">
                        <Skeleton className="h-4 w-8" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-40" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-56" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-28" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                    </tr>
                  ))
                : results.map((inquiry, index) => {
                    const isSelected = selectedId === inquiry._id;

                    return (
                      <tr
                        key={inquiry._id}
                        onClick={() => onSelect(inquiry._id)}
                        className={cn(
                          "cursor-pointer border-b border-slate-100 transition-colors",
                          isSelected ? "bg-blue-50" : "text-slate-800 hover:bg-slate-50",
                        )}
                      >
                        <td className="py-3 pr-2 text-slate-500">{index + 1}</td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">{inquiry.name}</p>
                          <p className="text-xs text-slate-500">{inquiry.email}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{inquiry.subject}</td>
                        <td className="px-3 py-3 text-slate-700">
                          {inquiry.persona_type ?? <span className="text-slate-400">-</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                              SUPPORT_INQUIRY_STATUS_COLORS[inquiry.status],
                            )}
                          >
                            {SUPPORT_INQUIRY_STATUS_LABELS[inquiry.status]}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {inquiry.assigned_admin_name ?? (
                            <span className="text-slate-400">Unassigned</span>
                          )}
                        </td>
                        <td
                          className="px-3 py-3 text-slate-500"
                          title={formatDateTime(inquiry._creationTime)}
                        >
                          {formatRelativeTime(inquiry._creationTime)}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!isLoading && results.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No support inquiries found</p>
            <p className="mt-1 text-sm text-slate-500">
              New inquiries will appear here as users submit support requests.
            </p>
          </div>
        ) : null}

        {(canLoadMore || isLoadingMore) && (
          <div className="flex justify-center pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => loadMore(20)}
              disabled={isLoadingMore}
              className="border-slate-300 text-slate-700"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
