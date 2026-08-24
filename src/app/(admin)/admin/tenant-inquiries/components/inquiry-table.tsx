"use client";

import { FileText, Loader2 } from "lucide-react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { type TenantInquiryStatus } from "../../../../../../lib/constants";
import { formatRelativeTime } from "../../../../../../lib/dates";
import { formatINR } from "../../../../../../lib/money";
import { formatPhoneDisplay } from "../../../../../../lib/validators";
import { InquiryStatusBadge } from "@/components/shared/inquiry-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type InquiryRow = {
  _id: Id<"tenant_inquiries">;
  _creationTime: number;
  status: TenantInquiryStatus;
  tenant_name: string;
  tenant_phone: string;
  bounty_amount?: number;
  listing: {
    slug: string;
    floor_number: string;
    bhk_config: string;
  } | null;
  lead: {
    flat_number: string;
  } | null;
  building: {
    name: string;
  } | null;
  guard: {
    _id: Id<"users">;
    name: string;
    phone?: string;
  } | null;
};

type InquiryTableProps = {
  data: InquiryRow[];
  selectedId: string | null;
  onSelect: (id: Id<"tenant_inquiries">) => void;
  loadMore: () => void;
  status: string;
};

const SKELETON_ROW_KEYS = [
  "row-1",
  "row-2",
  "row-3",
  "row-4",
  "row-5",
  "row-6",
  "row-7",
  "row-8",
] as const;

export function InquiryTable({ data, selectedId, onSelect, loadMore, status }: InquiryTableProps) {
  const isLoading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const isLoadingMore = status === "LoadingMore";

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="w-14 py-2.5 pr-2 font-medium">#</th>
                <th className="w-[25%] px-3 py-2.5 font-medium">Listing</th>
                <th className="w-[20%] px-3 py-2.5 font-medium">Tenant</th>
                <th className="w-[15%] px-3 py-2.5 font-medium">Status</th>
                <th className="w-[12%] px-3 py-2.5 font-medium">Bounty</th>
                <th className="w-[14%] px-3 py-2.5 font-medium">Guard</th>
                <th className="w-[10%] px-3 py-2.5 font-medium">Created</th>
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
                        <Skeleton className="h-4 w-52" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-36" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-6 w-28 rounded-full" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-14" />
                      </td>
                    </tr>
                  ))
                : data.map((inquiry, index) => {
                    const isSelected = selectedId === inquiry._id;
                    const listingLabel = `${inquiry.building?.name ?? "—"} / Flat ${inquiry.lead?.flat_number ?? "—"}`;

                    return (
                      <tr
                        key={inquiry._id}
                        onClick={() => onSelect(inquiry._id)}
                        className={cn(
                          "cursor-pointer border-b border-slate-100 transition-colors",
                          isSelected ? "bg-blue-50" : "text-slate-800 hover:bg-slate-50",
                        )}
                      >
                        <td className="py-3 pr-2 font-medium text-slate-500">{index + 1}</td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">{listingLabel}</p>
                          <p className="text-xs text-slate-500">
                            {inquiry.listing?.bhk_config ?? "—"}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">{inquiry.tenant_name}</p>
                          <p className="text-xs text-slate-500">
                            {formatPhoneDisplay(inquiry.tenant_phone)}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <InquiryStatusBadge status={inquiry.status} />
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-700">
                          {inquiry.bounty_amount !== undefined
                            ? formatINR(inquiry.bounty_amount)
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-slate-700">{inquiry.guard?.name ?? "—"}</td>
                        <td className="px-3 py-3 text-slate-500">
                          {formatRelativeTime(inquiry._creationTime)}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!isLoading && data.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No tenant inquiries found</p>
            <p className="mt-1 text-sm text-slate-500">
              New listing inquiry requests will appear here.
            </p>
          </div>
        )}

        {!isLoading && (
          <p className="pt-4 text-sm text-muted-foreground">
            Showing {data.length} results{canLoadMore ? " (more available)" : ""}
          </p>
        )}

        {(canLoadMore || isLoadingMore) && (
          <div className="flex justify-center pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={loadMore}
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
