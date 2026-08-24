"use client";

import { useRouter } from "next/navigation";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  NEGOTIATION_STATUS_COLORS,
  NEGOTIATION_STATUS_LABELS,
} from "../../../../../../lib/constants";
import { formatDateTime } from "../../../../../../lib/dates";
import { SortableHeader, type SortState } from "@/components/admin/SortableHeader";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type NegotiationSortBy = "created_at" | "last_activity_at" | "days_in_status";

export type NegotiationRow = {
  _id: Id<"negotiations">;
  status: string;
  created_at: number;
  last_activity_at: number;
  listing_name: string;
  listing_slug: string | null;
  tenant_name: string;
  owner_name: string;
  proposal_count: number;
  days_in_status: number;
  flags: {
    is_stale: boolean;
    too_many_rounds: boolean;
    token_without_agreement: boolean;
  };
};

type NegotiationTableProps = {
  rows: NegotiationRow[];
  isLoading: boolean;
  sortState: SortState;
  onSort: (column: NegotiationSortBy) => void;
};

function FlagBadges({
  flags,
}: {
  flags: {
    is_stale: boolean;
    too_many_rounds: boolean;
    token_without_agreement: boolean;
  };
}) {
  if (!flags.is_stale && !flags.too_many_rounds && !flags.token_without_agreement) {
    return <span className="text-xs text-slate-400">-</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {flags.is_stale ? (
        <Badge variant="secondary" className="bg-red-100 text-[10px] font-semibold text-red-700">
          Stale
        </Badge>
      ) : null}
      {flags.too_many_rounds ? (
        <Badge
          variant="secondary"
          className="bg-yellow-100 text-[10px] font-semibold text-yellow-800"
        >
          Too Many Rounds
        </Badge>
      ) : null}
      {flags.token_without_agreement ? (
        <Badge
          variant="secondary"
          className="bg-orange-100 text-[10px] font-semibold text-orange-700"
        >
          Token Without Agreement
        </Badge>
      ) : null}
    </div>
  );
}

export function NegotiationTable({ rows, isLoading, sortState, onSort }: NegotiationTableProps) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2.5 font-medium">Listing</th>
            <th className="px-3 py-2.5 font-medium">Tenant</th>
            <th className="px-3 py-2.5 font-medium">Owner</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <SortableHeader
              column="days_in_status"
              label="Days in Status"
              currentSort={sortState}
              onSortAction={(column) => onSort(column as NegotiationSortBy)}
            />
            <th className="px-3 py-2.5 font-medium">Rounds</th>
            <th className="px-3 py-2.5 font-medium">Flags</th>
            <SortableHeader
              column="last_activity_at"
              label="Last Activity"
              currentSort={sortState}
              onSortAction={(column) => onSort(column as NegotiationSortBy)}
            />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isLoading
            ? ["a", "b", "c", "d", "e"].map((key) => (
                <tr key={`negotiation-skeleton-${key}`}>
                  <td className="px-3 py-3">
                    <Skeleton className="h-4 w-44" />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-5 w-24" />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-4 w-14" />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-4 w-12" />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-5 w-40" />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-4 w-28" />
                  </td>
                </tr>
              ))
            : rows.map((row) => {
                const statusColor =
                  NEGOTIATION_STATUS_COLORS[row.status as keyof typeof NEGOTIATION_STATUS_COLORS] ??
                  "bg-slate-100 text-slate-700";
                const statusLabel =
                  NEGOTIATION_STATUS_LABELS[row.status as keyof typeof NEGOTIATION_STATUS_LABELS] ??
                  row.status;

                return (
                  <tr
                    key={row._id}
                    className={cn("cursor-pointer hover:bg-slate-50")}
                    onClick={() => router.push(`/admin/negotiations/${row._id}`)}
                  >
                    <td className="px-3 py-3">
                      <div className="space-y-0.5">
                        <p className="font-medium text-slate-900">{row.listing_name}</p>
                        <p className="text-xs text-slate-500">
                          {row.listing_slug ? `/listing/${row.listing_slug}` : "No slug"}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.tenant_name}</td>
                    <td className="px-3 py-3 text-slate-700">{row.owner_name}</td>
                    <td className="px-3 py-3">
                      <Badge variant="secondary" className={cn("font-semibold", statusColor)}>
                        {statusLabel}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-800">{row.days_in_status}</td>
                    <td className="px-3 py-3 text-slate-700">{row.proposal_count}</td>
                    <td className="px-3 py-3">
                      <FlagBadges flags={row.flags} />
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {formatDateTime(row.last_activity_at)}
                    </td>
                  </tr>
                );
              })}

          {!isLoading && rows.length === 0 ? (
            <tr>
              <td className="px-3 py-10 text-center text-slate-500" colSpan={8}>
                No negotiations found for the selected filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
