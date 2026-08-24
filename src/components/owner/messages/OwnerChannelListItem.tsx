"use client";

import Link from "next/link";
import { MessageCircle, MessageSquareText } from "lucide-react";
import { formatRelativeTime } from "../../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { OwnerChannelListRow } from "./types";

type OwnerChannelListItemProps = {
  channel: OwnerChannelListRow;
};

function getChannelTitle(channel: OwnerChannelListRow): string {
  const parts = [
    channel.listing_summary.building_name,
    channel.listing_summary.flat_number ? `Flat ${channel.listing_summary.flat_number}` : null,
  ].filter((value): value is string => Boolean(value));

  if (parts.length > 0) {
    return parts.join(" • ");
  }

  if (channel.listing_summary.slug) {
    return `/listing/${channel.listing_summary.slug}`;
  }

  return `Inquiry ${String(channel.inquiry_id).slice(-6)}`;
}

export function OwnerChannelListItem({ channel }: OwnerChannelListItemProps) {
  const title = getChannelTitle(channel);

  return (
    <Link href={`/owner/messages/${channel.channel_id}`} className="block">
      <Card className="border-indigo-100 transition hover:border-indigo-300 hover:shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
              <p className="text-xs text-slate-500">
                {channel.listing_summary.society_name ?? "Conversation"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {channel.unread_count > 0 ? (
                <Badge className="bg-indigo-600 text-white">{channel.unread_count}</Badge>
              ) : null}
              {channel.status === "ARCHIVED" ? (
                <Badge variant="outline" className="border-slate-300 text-slate-500">
                  Archived
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="line-clamp-1 text-sm text-slate-600">
              {channel.last_message_preview ?? "No messages yet"}
            </p>
            <span className="shrink-0 text-xs text-slate-400">
              {formatRelativeTime(channel.last_message_at)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-700">
            <MessageCircle className="size-3.5" />
            <span>Open conversation</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function OwnerChannelListItemSkeleton() {
  return (
    <Card className="border-indigo-100">
      <CardContent className="space-y-3 p-4">
        <div className="h-4 w-2/3 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-100" />
        <div className="h-3 w-full rounded bg-slate-100" />
        <div className="h-3 w-1/3 rounded bg-slate-100" />
      </CardContent>
    </Card>
  );
}

export function OwnerChannelListEmpty({ archived }: { archived: boolean }) {
  return (
    <Card className="border-dashed border-slate-300 bg-white">
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <MessageSquareText className="size-8 text-slate-300" />
        <p className="text-sm font-semibold text-slate-700">
          {archived ? "No archived conversations" : "No conversations yet"}
        </p>
        <p className="max-w-xs text-xs text-slate-500">
          {archived
            ? "Archived channels will appear here once chats are archived."
            : "Start by responding to a tenant inquiry and your deal conversations will appear here."}
        </p>
      </CardContent>
    </Card>
  );
}
