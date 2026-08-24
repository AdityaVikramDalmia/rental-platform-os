"use client";

import { FileText } from "lucide-react";
import { formatDate } from "../../../../lib/dates";
import { InquiryChatPanel } from "@/components/owner/messages/InquiryChatPanel";
import type { OwnerChannelListRow } from "@/components/owner/messages/types";
import type {
  OwnerLeadListItem,
  OwnerPropertyListItem,
} from "@/components/owner/properties/OwnerPropertyDetailSheet";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type OwnerLeadDetailSheetProps = {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  lead: OwnerLeadListItem | null;
  listing: OwnerPropertyListItem | null;
  channels: OwnerChannelListRow[];
};

export function OwnerLeadDetailSheet({
  open,
  onOpenChangeAction,
  lead,
  listing,
  channels,
}: OwnerLeadDetailSheetProps) {
  const channel = lead
    ? ([...channels]
        .filter((candidate) => {
          if (listing?.slug && candidate.listing_summary.slug === listing.slug) {
            return true;
          }

          if (candidate.listing_summary.flat_number !== lead.flat_number) {
            return false;
          }

          if (
            lead.building_name &&
            candidate.listing_summary.building_name !== lead.building_name
          ) {
            return false;
          }

          return true;
        })
        .sort((a, b) => b.last_message_at - a.last_message_at)[0] ?? null)
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChangeAction}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto rounded-t-2xl px-4 pb-safe"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-indigo-600" />
            Lead detail
          </SheetTitle>
          <SheetDescription>
            {lead ? `Flat ${lead.flat_number}` : "Select a lead to view details."}
          </SheetDescription>
        </SheetHeader>

        {lead ? (
          <div className="space-y-4 pb-4">
            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Lead</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Flat {lead.flat_number}</p>
              <p className="mt-1 text-xs text-slate-600">Status: {lead.status}</p>
              <p className="text-xs text-slate-500">Created {formatDate(lead._creationTime)}</p>
              <p className="mt-2 text-xs text-slate-600">
                {lead.society_name ?? "Society unavailable"}
                {lead.building_name ? ` - ${lead.building_name}` : ""}
              </p>
              {listing?.slug ? (
                <p className="mt-1 text-xs text-indigo-700">
                  Linked listing: /listing/{listing.slug}
                </p>
              ) : null}
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Conversation
              </p>
              {channel ? (
                <InquiryChatPanel channelId={channel.channel_id} ownerMode={false} />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                  No conversation has been started for this lead yet.
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="py-6 text-sm text-slate-500">No lead selected.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
