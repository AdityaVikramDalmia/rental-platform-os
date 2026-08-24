"use client";

import type { Id } from "../../../../../../convex/_generated/dataModel";
import { formatINR } from "../../../../../../lib/money";
import { Clock3, Home, IndianRupee } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const HOUR_MS = 60 * 60 * 1000;

export type BountyCardProps = {
  bounty: {
    _id: Id<"tenant_inquiries">;
    listing_bhk: string | null;
    listing_rent: number | null;
    building_name: string | null;
    society_name: string | null;
    floor_number: string | null;
    flat_number: string | null;
    preferred_visit_date?: number;
    preferred_visit_slot?: string;
    bounty_amount?: number;
    bounty_expires_at?: number;
  };
  onAccept: (id: Id<"tenant_inquiries">) => void;
  isAccepting: boolean;
};

function getExpiryLabel(expiresAt: number | undefined): string {
  if (!expiresAt) {
    return "Expiry pending";
  }

  const diffMs = expiresAt - Date.now();
  if (diffMs <= 0) {
    return "Expired";
  }

  const totalHoursRemaining = Math.max(Math.floor(diffMs / HOUR_MS), 1);
  const days = Math.floor(totalHoursRemaining / 24);
  const hours = totalHoursRemaining % 24;

  return `Expires in ${days}d ${hours}h`;
}

export function BountyCard({ bounty, onAccept, isAccepting }: BountyCardProps) {
  const addressLine = [
    bounty.building_name ?? "Building",
    bounty.floor_number ? `Fl ${bounty.floor_number}` : null,
    bounty.flat_number ? `#${bounty.flat_number}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const listingLine =
    bounty.listing_bhk && bounty.listing_rent !== null
      ? `${bounty.listing_bhk} • ${formatINR(bounty.listing_rent)}/mo`
      : bounty.listing_bhk
        ? bounty.listing_bhk
        : bounty.listing_rent !== null
          ? `${formatINR(bounty.listing_rent)}/mo`
          : "Listing details pending";

  const preferredDate = bounty.preferred_visit_date
    ? new Date(bounty.preferred_visit_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })
    : "ASAP";

  const preferredSlot = bounty.preferred_visit_slot ?? "Flexible";
  const bountyAmount = bounty.bounty_amount !== undefined ? formatINR(bounty.bounty_amount) : "TBD";

  return (
    <Card className="gap-0 border-slate-200 py-4">
      <CardContent className="space-y-3 px-4">
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <Home className="mt-0.5 size-4 shrink-0 text-slate-500" />
            <div>
              <p className="text-base font-semibold text-slate-900">{addressLine}</p>
              <p className="text-sm text-slate-500">{bounty.society_name ?? "Society"}</p>
              <p className="text-sm font-medium text-slate-700">{listingLine}</p>
            </div>
          </div>
        </div>

        <div className="space-y-1 rounded-lg bg-slate-50 p-3">
          <p className="text-sm text-slate-700">
            Tenant wants: {preferredDate}, {preferredSlot}
          </p>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
            <IndianRupee className="size-4" />
            <span>Bounty: {bountyAmount}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
            <Clock3 className="size-3.5" />
            <span>{getExpiryLabel(bounty.bounty_expires_at)}</span>
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={isAccepting}
              className="w-full bg-green-600 text-white hover:bg-green-700"
            >
              {isAccepting ? "Accepting..." : "Accept Bounty"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Accept bounty assignment</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to accept this bounty? This commits you to conducting the
                property showing.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{addressLine}</p>
              <p>{listingLine}</p>
              <p>Bounty: {bountyAmount}</p>
              <p>
                Tenant preference: {preferredDate}, {preferredSlot}
              </p>
              <p>{getExpiryLabel(bounty.bounty_expires_at)}</p>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isAccepting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isAccepting}
                onClick={(event) => {
                  event.preventDefault();
                  onAccept(bounty._id);
                }}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                {isAccepting ? "Accepting..." : "Yes, Accept"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
