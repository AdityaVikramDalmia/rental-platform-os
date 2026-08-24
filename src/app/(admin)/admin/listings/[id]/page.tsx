"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { PERMISSIONS, type ListingStatus } from "../../../../../../lib/constants";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { ListingStatusBadge } from "@/components/shared/listing-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ListingForm } from "../components/listing-form";
import { ListingStatusControls } from "../components/listing-status-controls";
import { InquiryList } from "../components/inquiry-list";

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const listingId = params.id as Id<"listings">;

  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );
  const permissionSet = useMemo(() => {
    const permissions = new Set<string>();
    if (!roleAssignments) return permissions;
    for (const assignment of roleAssignments) {
      for (const permission of assignment.role.permissions) {
        permissions.add(permission);
      }
    }
    return permissions;
  }, [roleAssignments]);

  const hasListingsView =
    roleAssignments !== undefined && permissionSet.has(PERMISSIONS.LISTINGS_VIEW);
  const hasEdit = permissionSet.has(PERMISSIONS.LISTINGS_EDIT);
  const hasPublish = permissionSet.has(PERMISSIONS.LISTINGS_PUBLISH);
  const hasViewInquiries = permissionSet.has(PERMISSIONS.LISTINGS_VIEW_INQUIRIES);

  const listing = useQuery(
    api.listings.getById,
    hasListingsView ? { listing_id: listingId } : "skip",
  );

  if (listing === undefined || currentUser === undefined) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-10 w-72" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="space-y-4">
        <Breadcrumb
          items={[{ label: "Listings", href: "/admin/listings" }, { label: "Listing not found" }]}
        />
        <p className="text-sm text-slate-600">Listing not found.</p>
      </div>
    );
  }

  const listingTitle = `${listing.bhk_config} ${listing.building?.name ?? "—"}/${listing.floor_number}`;
  const sourceLeadLabel = `Lead ${listing.lead_id.slice(0, 10)}...`;
  const listingBreadcrumbLabel = `${listing.building?.name ?? "Listing"} / ${listing.lead?.flat_number ?? "—"}`;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Breadcrumb
          items={[
            { label: "Listings", href: "/admin/listings" },
            { label: listingBreadcrumbLabel },
          ]}
        />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {listingTitle}
              </h2>
              <ListingStatusBadge status={listing.status} size="md" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {listing.society ? (
                listing.society.society_id ? (
                  <Link
                    href={`/admin/societies/${listing.society.society_id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {listing.society.name}, {listing.society.city}
                  </Link>
                ) : (
                  <span>
                    {listing.society.name}, {listing.society.city}
                  </span>
                )
              ) : null}
              <span>&middot;</span>
              <span>
                Source Lead:{" "}
                {listing.lead_id ? (
                  <Link
                    href={`/admin/leads?id=${listing.lead_id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {sourceLeadLabel}
                  </Link>
                ) : (
                  <span>{sourceLeadLabel}</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {hasPublish && (
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-4">
            <ListingStatusControls
              listingId={listingId}
              status={listing.status as ListingStatus}
              slug={listing.slug}
              photoCount={listing.photo_count}
            />
          </CardContent>
        </Card>
      )}

      {hasEdit && (
        <>
          <Separator />
          <ListingForm mode="edit" listingId={listingId} />
        </>
      )}

      {hasViewInquiries && (
        <>
          <Separator />
          <InquiryList listingId={listingId} />
        </>
      )}
    </div>
  );
}
