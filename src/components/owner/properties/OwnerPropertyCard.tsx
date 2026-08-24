"use client";

import Link from "next/link";
import type { ClosureStatus } from "../../../../lib/constants";
import { ClosureStatusBadge } from "@/components/shared/closure-status-badge";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";
import { ListingStatusBadge } from "@/components/shared/listing-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type OwnerPropertyCardProps = {
  leadId: string;
  societyName: string | null;
  buildingName: string | null;
  flatNumber: string;
  leadStatus: string;
  listingStatus?: string;
  closureStatus?: ClosureStatus;
  onViewDetailsAction?: () => void;
};

function toLeadLink(leadId: string): string {
  return `/owner/leads?leadId=${encodeURIComponent(leadId)}`;
}

function toEarningsLink(leadId: string): string {
  return `/owner/earnings?leadId=${encodeURIComponent(leadId)}`;
}

export function OwnerPropertyCard({
  leadId,
  societyName,
  buildingName,
  flatNumber,
  leadStatus,
  listingStatus,
  closureStatus,
  onViewDetailsAction,
}: OwnerPropertyCardProps) {
  const locationLabel = [buildingName, societyName].filter(Boolean).join(" - ") || "Property";

  return (
    <Card className="border-slate-200 bg-white shadow-sm transition-colors hover:border-indigo-200">
      <CardContent className="space-y-4 p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">Flat {flatNumber}</p>
          <p className="text-xs text-slate-500">{locationLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LeadStatusBadge status={leadStatus} />
          {listingStatus ? (
            <ListingStatusBadge status={listingStatus} />
          ) : (
            <Badge>No Listing</Badge>
          )}
          {closureStatus ? (
            <ClosureStatusBadge status={closureStatus} />
          ) : (
            <Badge>No Closure</Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {onViewDetailsAction ? (
            <Button
              type="button"
              variant="outline"
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
              onClick={onViewDetailsAction}
            >
              View Details
            </Button>
          ) : null}
          <Button
            asChild
            variant="outline"
            className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            <Link href={toLeadLink(leadId)}>Lead Timeline</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-violet-200 text-violet-700 hover:bg-violet-50"
          >
            <Link href={toEarningsLink(leadId)}>Earnings</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
