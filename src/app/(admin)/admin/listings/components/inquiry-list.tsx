"use client";

import { usePaginatedQuery } from "convex/react";
import { Loader2, MessageSquare } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { INQUIRY_SOURCE } from "../../../../../../lib/constants";
import { formatRelativeTime } from "../../../../../../lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SOURCE_COLORS: Record<string, string> = {
  [INQUIRY_SOURCE.CONTACT_FORM]: "bg-blue-100 text-blue-700",
  [INQUIRY_SOURCE.WHATSAPP_CLICK]: "bg-green-100 text-green-700",
};

const SOURCE_LABELS: Record<string, string> = {
  [INQUIRY_SOURCE.CONTACT_FORM]: "Contact Form",
  [INQUIRY_SOURCE.WHATSAPP_CLICK]: "WhatsApp Click",
};

function formatPhoneDisplay(phone: string): string {
  if (phone.length !== 10) return phone;
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

type InquiryListProps = {
  listingId: Id<"listings">;
};

export function InquiryList({ listingId }: InquiryListProps) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.listings.getInquiries,
    { listing_id: listingId },
    { initialNumItems: 20 },
  );

  const isLoading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const isLoadingMore = status === "LoadingMore";

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="size-5 text-slate-500" />
          Inquiries
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`inquiry-skeleton-${index}`} className="flex gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="py-8 text-center">
            <MessageSquare className="mx-auto mb-2 size-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No inquiries yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Inquiries will appear here when visitors reach out via the listing page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Phone</th>
                  <th className="px-3 py-2.5 font-medium">Message</th>
                  <th className="w-28 px-3 py-2.5 font-medium">Source</th>
                  <th className="w-24 px-3 py-2.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {results.map((inquiry, index) => (
                  <tr
                    key={`${inquiry._creationTime}-${index}`}
                    className="border-b border-slate-100"
                  >
                    <td className="px-3 py-3 font-medium text-slate-900">{inquiry.name}</td>
                    <td className="px-3 py-3">
                      <a
                        href={`tel:+91${inquiry.phone}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {formatPhoneDisplay(inquiry.phone)}
                      </a>
                    </td>
                    <td className="max-w-xs truncate px-3 py-3 text-slate-600">
                      {inquiry.message ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                          SOURCE_COLORS[inquiry.source] ?? "bg-gray-100 text-gray-600",
                        )}
                      >
                        {SOURCE_LABELS[inquiry.source] ?? inquiry.source}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {formatRelativeTime(inquiry._creationTime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
