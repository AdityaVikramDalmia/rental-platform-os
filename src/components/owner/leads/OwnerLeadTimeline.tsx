"use client";

import Link from "next/link";
import type { ClosureStatus } from "../../../../lib/constants";
import { formatDate } from "../../../../lib/dates";
import { ClosureStatusBadge } from "@/components/shared/closure-status-badge";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";
import { ListingStatusBadge } from "@/components/shared/listing-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type OwnerLeadTimelineRow = {
  lead_id: string;
  submitted_at: number;
  status: string;
  society_name: string | null;
  building_name: string | null;
  flat_number: string;
  listing_id?: string;
  listing_status?: string;
  closure_id?: string;
  closure_status?: ClosureStatus;
};

type OwnerLeadTimelineProps = {
  rows: OwnerLeadTimelineRow[];
  highlightedLeadId?: string | null;
  onViewDetailsAction?: (leadId: string) => void;
};

const LEAD_STAGE_COPY: Record<string, string> = {
  SUBMITTED: "Under review by the Rental Platform OS verification team.",
  NEED_INFO: "We need more details to move this lead forward.",
  POTENTIAL_DUPLICATE: "Potential duplicate detected and awaiting admin review.",
  VERIFIED: "Verified and ready for active listing/closure progression.",
  REJECTED: "Lead is closed and will not move forward right now.",
  DUPLICATE: "Mapped as duplicate of an existing lead.",
};

function getPropertyLabel(row: OwnerLeadTimelineRow): string {
  const location = [row.building_name, row.society_name].filter(Boolean).join(" - ");
  if (!location) {
    return `Flat ${row.flat_number}`;
  }

  return `${location} - Flat ${row.flat_number}`;
}

export function OwnerLeadTimeline({
  rows,
  highlightedLeadId,
  onViewDetailsAction,
}: OwnerLeadTimelineProps) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const isHighlighted = highlightedLeadId ? row.lead_id === highlightedLeadId : false;

        return (
          <Card
            key={row.lead_id}
            className={
              isHighlighted
                ? "border-indigo-300 bg-indigo-50/40 shadow-sm"
                : "border-slate-200 bg-white shadow-sm"
            }
          >
            <CardContent className="space-y-3 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">{getPropertyLabel(row)}</p>
                <p className="text-xs text-slate-500">
                  Submitted on {formatDate(row.submitted_at)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <LeadStatusBadge status={row.status} />
                {row.listing_status ? (
                  <ListingStatusBadge status={row.listing_status} />
                ) : (
                  <Badge>No Listing</Badge>
                )}
                {row.closure_status ? (
                  <ClosureStatusBadge status={row.closure_status} />
                ) : (
                  <Badge>No Closure</Badge>
                )}
              </div>

              <p className="text-xs text-slate-600">
                {LEAD_STAGE_COPY[row.status] ?? "Lead is being processed."}
              </p>

              <div className="flex flex-wrap gap-2">
                {onViewDetailsAction ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-slate-300 text-slate-700 hover:bg-slate-50"
                    onClick={() => onViewDetailsAction(row.lead_id)}
                  >
                    View Details
                  </Button>
                ) : null}
                {row.listing_id ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  >
                    <Link href="/owner/messages">Open Messages</Link>
                  </Button>
                ) : null}
                {row.closure_id ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="border-violet-200 text-violet-700 hover:bg-violet-50"
                  >
                    <Link href={`/owner/earnings?leadId=${encodeURIComponent(row.lead_id)}`}>
                      Track Earnings
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
