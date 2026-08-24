"use client";

import { Gift, Loader2 } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  REFERRAL_STATUS_COLORS,
  REFERRAL_STATUS_LABELS,
  REFERRAL_TYPE_LABELS,
  type ReferralStatus,
  type ReferralType,
} from "../../../lib/constants";
import { formatRelativeTime } from "../../../lib/dates";
import { formatINR } from "../../../lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type PaginationStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

export type ReferralListItem = {
  _id: Id<"referrals">;
  _creationTime: number;
  referrer_name: string;
  referred_name: string;
  referral_type: ReferralType;
  status: ReferralStatus;
  total_bonus: number;
};

type ReferralTableProps = {
  referrals: ReferralListItem[];
  status: PaginationStatus;
  selectedReferralId: Id<"referrals"> | null;
  selectReferralAction: (id: Id<"referrals">) => void;
  loadMoreAction: () => void;
};

const SKELETON_ROW_IDS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const SKELETON_COL_IDS = ["1", "2", "3", "4", "5", "6", "7"] as const;

export function ReferralTable({
  referrals,
  status,
  selectedReferralId,
  selectReferralAction,
  loadMoreAction,
}: ReferralTableProps) {
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
                <th className="w-12 px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Referrer</th>
                <th className="px-3 py-2.5 font-medium">Referred User</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Total Bonus</th>
                <th className="px-3 py-2.5 font-medium">Created</th>
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? SKELETON_ROW_IDS.map((rowId) => (
                    <tr key={`referral-skeleton-${rowId}`} className="border-b border-slate-100">
                      {SKELETON_COL_IDS.map((colId) => (
                        <td key={`referral-skeleton-${rowId}-${colId}`} className="px-3 py-3">
                          <Skeleton className={colId === "1" ? "h-4 w-6" : "h-4 w-24"} />
                        </td>
                      ))}
                    </tr>
                  ))
                : referrals.map((referral, index) => {
                    const isSelected = selectedReferralId === referral._id;
                    return (
                      <tr
                        key={referral._id}
                        onClick={() => selectReferralAction(referral._id)}
                        className={cn(
                          "cursor-pointer border-b border-slate-100 text-slate-800 transition-colors hover:bg-slate-50",
                          isSelected && "bg-slate-100",
                        )}
                      >
                        <td className="px-3 py-3 text-slate-400">{index + 1}</td>
                        <td className="px-3 py-3 font-medium text-slate-900">
                          {referral.referrer_name}
                        </td>
                        <td className="px-3 py-3 text-slate-700">{referral.referred_name}</td>
                        <td className="px-3 py-3">
                          <Badge className="bg-slate-100 text-slate-700">
                            {REFERRAL_TYPE_LABELS[referral.referral_type]}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <Badge className={REFERRAL_STATUS_COLORS[referral.status]}>
                            {REFERRAL_STATUS_LABELS[referral.status]}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-900">
                          {formatINR(referral.total_bonus)}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {formatRelativeTime(referral._creationTime)}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!isLoading && referrals.length === 0 && (
          <div className="py-12 text-center">
            <Gift className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No referrals found</p>
            <p className="mt-1 text-sm text-slate-500">Try changing type or status filters.</p>
          </div>
        )}

        {!isLoading && referrals.length > 0 && (
          <p className="pt-4 text-sm text-muted-foreground">
            Showing {referrals.length} results{canLoadMore ? " (more available)" : ""}
          </p>
        )}

        {(canLoadMore || isLoadingMore) && (
          <div className="flex justify-center pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={loadMoreAction}
              disabled={isLoadingMore}
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
