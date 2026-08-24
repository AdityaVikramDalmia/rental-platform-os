"use client";

import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import { FileText } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { CHAT_CHANNEL_STATUS } from "../../../../../lib/constants";
import { OwnerLeadDetailSheet } from "@/components/owner/leads/OwnerLeadDetailSheet";
import { OwnerLeadTimeline } from "@/components/owner/leads/OwnerLeadTimeline";
import type {
  OwnerLeadListItem,
  OwnerPropertyListItem,
} from "@/components/owner/properties/OwnerPropertyDetailSheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function LeadsLoadingState() {
  return (
    <div className="space-y-3">
      {["lead-skeleton-1", "lead-skeleton-2", "lead-skeleton-3"].map((key) => (
        <Card key={key} className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function OwnerLeadsPage() {
  const searchParams = useSearchParams();
  const selectedLeadId = searchParams.get("leadId");
  const leads = useQuery(api.owners.getMyLeads);
  const properties = useQuery(api.owners.getMyProperties);
  const { results: channels } = usePaginatedQuery(
    api.chatChannels.listForOwner,
    { status: CHAT_CHANNEL_STATUS.ACTIVE },
    { initialNumItems: 50 },
  );
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);

  const ownerLeads = properties?.leads ?? [];
  const ownerListings = properties?.listings ?? [];

  const leadById = useMemo(() => {
    const map = new Map<string, OwnerLeadListItem>();
    for (const lead of ownerLeads) {
      map.set(String(lead._id), {
        _id: String(lead._id),
        flat_number: lead.flat_number,
        status: lead.status,
        society_name: lead.society_name,
        building_name: lead.building_name,
        _creationTime: lead._creationTime,
      });
    }
    return map;
  }, [ownerLeads]);

  const listingByLeadId = useMemo(() => {
    const map = new Map<string, OwnerPropertyListItem>();
    for (const listing of ownerListings) {
      map.set(String(listing.lead_id), {
        _id: String(listing._id),
        lead_id: String(listing.lead_id),
        status: listing.status,
        slug: listing.slug,
        _creationTime: listing._creationTime,
      });
    }
    return map;
  }, [ownerListings]);

  if (leads === undefined || properties === undefined) {
    return (
      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Lead Pipeline</h1>
          <p className="text-sm text-slate-600">Track each lead from submission to closure.</p>
        </header>
        <LeadsLoadingState />
      </div>
    );
  }

  const filteredLeads = selectedLeadId
    ? leads.filter((lead) => String(lead.lead_id) === selectedLeadId)
    : leads;

  const hasAnyLeads = leads.length > 0;

  const detailLead = detailLeadId ? (leadById.get(detailLeadId) ?? null) : null;
  const detailListing = detailLeadId ? (listingByLeadId.get(detailLeadId) ?? null) : null;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-indigo-700" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Lead Pipeline</h1>
        </div>
        <p className="text-sm text-slate-600">Track each lead from submission to closure.</p>
      </header>

      {selectedLeadId ? (
        <Card className="border-indigo-200 bg-indigo-50/70 shadow-sm">
          <CardContent className="flex items-center justify-between gap-3 p-3">
            <p className="text-xs text-indigo-900">Filtered to a specific property lead.</p>
            <Button asChild size="sm" variant="outline" className="border-indigo-300 bg-white">
              <Link href="/owner/leads">Clear Filter</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!hasAnyLeads ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-sm font-medium text-slate-800">No leads linked yet</p>
            <p className="text-sm text-slate-600">
              Once your properties enter the pipeline, this page will show status-by-status
              progress.
            </p>
            <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
              <Link href="/owner/service-requests">Create Service Request</Link>
            </Button>
          </CardContent>
        </Card>
      ) : filteredLeads.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-sm font-medium text-slate-800">No lead found for this filter</p>
            <Button asChild variant="outline">
              <Link href="/owner/leads">Show All Leads</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <OwnerLeadTimeline
          rows={filteredLeads.map((lead) => ({
            lead_id: String(lead.lead_id),
            submitted_at: lead.submitted_at,
            status: lead.status,
            society_name: lead.society_name,
            building_name: lead.building_name,
            flat_number: lead.flat_number,
            listing_id: lead.listing_id ? String(lead.listing_id) : undefined,
            listing_status: lead.listing_status,
            closure_id: lead.closure_id ? String(lead.closure_id) : undefined,
            closure_status: lead.closure_status,
          }))}
          highlightedLeadId={selectedLeadId}
          onViewDetailsAction={(leadId) => setDetailLeadId(leadId)}
        />
      )}

      <OwnerLeadDetailSheet
        open={detailLeadId !== null}
        onOpenChangeAction={(open) => {
          if (!open) {
            setDetailLeadId(null);
          }
        }}
        lead={detailLead}
        listing={detailListing}
        channels={channels}
      />
    </div>
  );
}
