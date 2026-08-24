"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OwnerChannelListEmpty,
  OwnerChannelListItem,
  OwnerChannelListItemSkeleton,
} from "./OwnerChannelListItem";
import type { OwnerChannelListRow, OwnerChannelStatus } from "./types";

type OwnerChannelListProps = {
  channels: OwnerChannelListRow[];
  status: OwnerChannelStatus;
  isLoading: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  onLoadMoreAction: () => void;
};

export function OwnerChannelList({
  channels,
  status,
  isLoading,
  isLoadingMore,
  canLoadMore,
  onLoadMoreAction,
}: OwnerChannelListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <OwnerChannelListItemSkeleton />
        <OwnerChannelListItemSkeleton />
        <OwnerChannelListItemSkeleton />
      </div>
    );
  }

  if (channels.length === 0) {
    return <OwnerChannelListEmpty archived={status === "ARCHIVED"} />;
  }

  return (
    <div className="space-y-3">
      {channels.map((channel) => (
        <OwnerChannelListItem key={channel.channel_id} channel={channel} />
      ))}

      {canLoadMore ? (
        <Button
          type="button"
          variant="outline"
          onClick={onLoadMoreAction}
          disabled={isLoadingMore}
          className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50"
        >
          {isLoadingMore ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {isLoadingMore ? "Loading conversations..." : "Load more conversations"}
        </Button>
      ) : null}
    </div>
  );
}
