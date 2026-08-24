"use client";

import { usePaginatedQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  OWNER_SERVICE_REQUEST_STATUS_COLORS,
  OWNER_SERVICE_REQUEST_STATUS_LABELS,
  type OwnerServiceRequestStatus,
} from "../../../../../../lib/constants";
import { formatINR } from "../../../../../../lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type RequestTableProps = {
  statusFilter: OwnerServiceRequestStatus | undefined;
  selectedId: Id<"owner_service_requests"> | null;
  onSelect: (id: Id<"owner_service_requests">) => void;
};

const SKELETON_ROW_KEYS = [
  "request-row-1",
  "request-row-2",
  "request-row-3",
  "request-row-4",
  "request-row-5",
] as const;

export function RequestTable({ statusFilter, selectedId, onSelect }: RequestTableProps) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.ownerServiceRequests.list,
    { status: statusFilter },
    { initialNumItems: 20 },
  );

  if (status === "LoadingFirstPage") {
    return (
      <div className="space-y-2 p-4">
        {SKELETON_ROW_KEYS.map((key) => (
          <Skeleton key={key} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-slate-400">
        <p className="text-sm">No owner requests found.</p>
      </div>
    );
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-600">#</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">Phone</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">Property Type</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">Location</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {results.map((request, idx) => (
            <tr
              key={request._id}
              onClick={() => onSelect(request._id)}
              className={cn(
                "cursor-pointer transition-colors hover:bg-slate-50",
                selectedId === request._id ? "bg-blue-50 hover:bg-blue-50" : "",
              )}
            >
              <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{request.name}</div>
              </td>
              <td className="px-4 py-3 text-slate-700">+91 {request.phone}</td>
              <td className="px-4 py-3 text-slate-700">
                <div>{request.property_type ?? <span className="text-slate-400">-</span>}</div>
                {request.property_value !== undefined ? (
                  <div className="text-xs text-slate-500">
                    Value: {formatINR(request.property_value)}
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {request.location ?? <span className="text-slate-400">-</span>}
              </td>
              <td className="px-4 py-3">
                <Badge
                  className={cn(
                    "text-xs font-medium",
                    OWNER_SERVICE_REQUEST_STATUS_COLORS[
                      request.status as keyof typeof OWNER_SERVICE_REQUEST_STATUS_COLORS
                    ],
                  )}
                >
                  {OWNER_SERVICE_REQUEST_STATUS_LABELS[
                    request.status as keyof typeof OWNER_SERVICE_REQUEST_STATUS_LABELS
                  ] ?? request.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-slate-500">
                {formatDistanceToNow(new Date(request._creationTime), { addSuffix: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className="flex justify-center p-4">
          <Button type="button" variant="outline" onClick={() => loadMore(20)}>
            {status === "LoadingMore" ? "Loading..." : "Load More"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
