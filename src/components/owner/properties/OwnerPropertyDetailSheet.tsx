"use client";

import { Building2 } from "lucide-react";
import { formatDate } from "../../../../lib/dates";
import { InquiryChatPanel } from "@/components/owner/messages/InquiryChatPanel";
import type { OwnerChannelListRow } from "@/components/owner/messages/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type OwnerPropertyListItem = {
  _id: string;
  lead_id: string;
  status: string;
  slug: string;
  _creationTime: number;
};

export type OwnerLeadListItem = {
  _id: string;
  flat_number: string;
  status: string;
  society_name: string | null;
  building_name: string | null;
  _creationTime: number;
};

type OwnerPropertyDetailSheetProps = {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  property: OwnerPropertyListItem | null;
  lead: OwnerLeadListItem | null;
  channels: OwnerChannelListRow[];
};

export function OwnerPropertyDetailSheet({
  open,
  onOpenChangeAction,
  property,
  lead,
  channels,
}: OwnerPropertyDetailSheetProps) {
  const channel = property
    ? ([...channels]
        .filter((candidate) => candidate.listing_summary.slug === property.slug)
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
            <Building2 className="size-4 text-indigo-600" />
            Property detail
          </SheetTitle>
          <SheetDescription>
            {property ? `Listing /listing/${property.slug}` : "Select a property to view details."}
          </SheetDescription>
        </SheetHeader>

        {property ? (
          <div className="space-y-4 pb-4">
            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Listing</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">/listing/{property.slug}</p>
              <p className="mt-1 text-xs text-slate-600">Status: {property.status}</p>
              <p className="text-xs text-slate-500">Created {formatDate(property._creationTime)}</p>
              {lead ? (
                <p className="mt-2 text-xs text-slate-600">
                  {lead.building_name ?? "Building"} - Flat {lead.flat_number}
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
                  No conversation has been started for this property yet.
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="py-6 text-sm text-slate-500">No property selected.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
