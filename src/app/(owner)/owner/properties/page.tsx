"use client";

import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { Building2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { CHAT_CHANNEL_STATUS } from "../../../../../lib/constants";
import { OwnerPropertyCard } from "@/components/owner/properties/OwnerPropertyCard";
import {
  OwnerPropertyDetailSheet,
  type OwnerLeadListItem,
  type OwnerPropertyListItem,
} from "@/components/owner/properties/OwnerPropertyDetailSheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function PropertiesLoadingState() {
  return (
    <div className="space-y-3">
      {["property-skeleton-1", "property-skeleton-2", "property-skeleton-3"].map((key) => (
        <Card key={key} className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-52" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function OwnerPropertiesPage() {
  const properties = useQuery(api.owners.getMyProperties);
  const { results: channels } = usePaginatedQuery(
    api.chatChannels.listForOwner,
    { status: CHAT_CHANNEL_STATUS.ACTIVE },
    { initialNumItems: 50 },
  );
  const [selectedProperty, setSelectedProperty] = useState<{
    property: OwnerPropertyListItem;
    lead: OwnerLeadListItem | null;
  } | null>(null);

  if (properties === undefined) {
    return (
      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your Properties</h1>
          <p className="text-sm text-slate-600">Track listings, leads, and closure progress.</p>
        </header>
        <PropertiesLoadingState />
      </div>
    );
  }

  const hasPortfolioData =
    properties.leads.length > 0 || properties.listings.length > 0 || properties.closures.length > 0;

  const listingsByLeadId = new Map<string, (typeof properties.listings)[number]>();
  for (const listing of properties.listings) {
    const key = String(listing.lead_id);
    const existing = listingsByLeadId.get(key);
    if (!existing || listing._creationTime > existing._creationTime) {
      listingsByLeadId.set(key, listing);
    }
  }

  const closuresByLeadId = new Map<string, (typeof properties.closures)[number]>();
  for (const closure of properties.closures) {
    const key = String(closure.lead_id);
    const existing = closuresByLeadId.get(key);
    if (!existing || closure._creationTime > existing._creationTime) {
      closuresByLeadId.set(key, closure);
    }
  }

  const sortedLeads = [...properties.leads].sort((a, b) => b._creationTime - a._creationTime);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your Properties</h1>
        <p className="text-sm text-slate-600">Track listings, leads, and closure progress.</p>
      </header>

      {!hasPortfolioData ? (
        <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-indigo-900">
              <Building2 className="size-4" />
              No properties yet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-700">
              Start with a service request and our team will help onboard your first property.
            </p>
            <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
              <Link href="/owner/service-requests">Create Service Request</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedLeads.map((lead) => {
            const listing = listingsByLeadId.get(String(lead._id));
            const closure = closuresByLeadId.get(String(lead._id));

            return (
              <OwnerPropertyCard
                key={String(lead._id)}
                leadId={String(lead._id)}
                societyName={lead.society_name}
                buildingName={lead.building_name}
                flatNumber={lead.flat_number}
                leadStatus={lead.status}
                listingStatus={listing?.status}
                closureStatus={closure?.status}
                onViewDetailsAction={
                  listing
                    ? () => {
                        setSelectedProperty({
                          property: {
                            _id: String(listing._id),
                            lead_id: String(listing.lead_id),
                            status: listing.status,
                            slug: listing.slug,
                            _creationTime: listing._creationTime,
                          },
                          lead: {
                            _id: String(lead._id),
                            flat_number: lead.flat_number,
                            status: lead.status,
                            society_name: lead.society_name,
                            building_name: lead.building_name,
                            _creationTime: lead._creationTime,
                          },
                        });
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      )}

      <OwnerPropertyDetailSheet
        open={selectedProperty !== null}
        onOpenChangeAction={(open) => {
          if (!open) {
            setSelectedProperty(null);
          }
        }}
        property={selectedProperty?.property ?? null}
        lead={selectedProperty?.lead ?? null}
        channels={channels}
      />
    </div>
  );
}
