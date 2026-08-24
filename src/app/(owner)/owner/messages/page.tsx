"use client";

import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { MessageSquare } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { CHAT_CHANNEL_STATUS } from "../../../../../lib/constants";
import { OwnerChannelList } from "@/components/owner/messages/OwnerChannelList";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OwnerChannelStatus } from "@/components/owner/messages/types";

export default function OwnerMessagesPage() {
  const [activeStatus, setActiveStatus] = useState<OwnerChannelStatus>(CHAT_CHANNEL_STATUS.ACTIVE);

  const {
    results: channels,
    status: loadStatus,
    loadMore,
  } = usePaginatedQuery(
    api.chatChannels.listForOwner,
    {
      status: activeStatus,
    },
    {
      initialNumItems: 20,
    },
  );

  const isLoading = loadStatus === "LoadingFirstPage";
  const isLoadingMore = loadStatus === "LoadingMore";
  const canLoadMore = loadStatus === "CanLoadMore";

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-indigo-700">
          <MessageSquare className="size-4" />
          <h1 className="text-base font-semibold">Messages</h1>
        </div>
        <p className="text-sm text-slate-600">Track deal conversations with tenants and ops.</p>
      </header>

      <Tabs
        value={activeStatus}
        onValueChange={(value) => {
          if (value === CHAT_CHANNEL_STATUS.ACTIVE || value === CHAT_CHANNEL_STATUS.ARCHIVED) {
            setActiveStatus(value);
          }
        }}
      >
        <TabsList className="grid w-full grid-cols-2 border border-indigo-100 bg-white">
          <TabsTrigger value={CHAT_CHANNEL_STATUS.ACTIVE}>Active</TabsTrigger>
          <TabsTrigger value={CHAT_CHANNEL_STATUS.ARCHIVED}>Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      <OwnerChannelList
        channels={channels}
        status={activeStatus}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        canLoadMore={canLoadMore}
        onLoadMoreAction={() => loadMore(20)}
      />
    </div>
  );
}
