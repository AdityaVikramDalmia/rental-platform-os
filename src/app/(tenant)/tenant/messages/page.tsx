"use client";

import { usePaginatedQuery } from "convex/react";
import { Loader2, MessageSquare, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import { CHAT_CHANNEL_STATUS } from "../../../../../lib/constants";
import {
  ChannelListEmpty,
  ChannelListItem,
  ChannelListItemSkeleton,
  type TenantChannelListRow,
} from "@/components/tenant/messages/channel-list-item";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ChannelFilterTab = "ALL" | "ACTIVE" | "ARCHIVED";

const CHANNEL_FILTER_TABS: Array<{ key: ChannelFilterTab; label: string }> = [
  { key: "ALL", label: "All" },
  { key: CHAT_CHANNEL_STATUS.ACTIVE, label: "Active" },
  { key: CHAT_CHANNEL_STATUS.ARCHIVED, label: "Archived" },
];

export default function TenantMessagesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ChannelFilterTab>("ALL");
  const [isOffline, setIsOffline] = useState(false);

  const { results, status, loadMore } = usePaginatedQuery(
    api.chatChannels.listMyChannels,
    {
      status: activeTab === "ALL" ? undefined : activeTab,
    },
    {
      initialNumItems: 20,
    },
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateOnlineState = () => {
      const online = window.navigator.onLine;
      setIsOffline(!online);

      if (online) {
        router.refresh();
      }
    };

    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, [router]);

  const channels = results as TenantChannelListRow[];
  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  return (
    <div className="space-y-4 pb-8">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-cyan-700">
          <MessageSquare className="size-4" />
          <h1 className="text-base font-semibold">Messages</h1>
        </div>
        <p className="text-sm text-slate-600">
          Follow inquiry conversations and latest deal-room updates.
        </p>
      </header>

      {isOffline ? (
        <Card className="border-amber-200 bg-amber-50/80 shadow-sm">
          <CardContent className="flex items-center gap-2 p-3 text-xs text-amber-900">
            <WifiOff className="size-4" />
            <span>Reconnecting to live chat updates...</span>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Wifi className="size-3.5" />
          <span>Live updates connected</span>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {CHANNEL_FILTER_TABS.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <Button
              key={tab.key}
              type="button"
              variant="ghost"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "h-11 min-h-11 min-w-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2",
                isActive
                  ? "bg-cyan-600 text-white hover:bg-cyan-700 hover:text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              )}
            >
              {tab.label}
            </Button>
          );
        })}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <>
            <ChannelListItemSkeleton />
            <ChannelListItemSkeleton />
            <ChannelListItemSkeleton />
          </>
        ) : null}

        {!isLoading && channels.length === 0 ? (
          <ChannelListEmpty archived={activeTab === "ARCHIVED"} />
        ) : null}

        {!isLoading
          ? channels.map((channel) => (
              <ChannelListItem key={String(channel.channel_id)} channel={channel} />
            ))
          : null}

        {isLoadingMore ? (
          <div className="flex items-center justify-center py-2 text-sm text-slate-500">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading more conversations...
          </div>
        ) : null}

        {canLoadMore ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => loadMore(20)}
            disabled={isLoadingMore}
            className="w-full border-cyan-200 text-cyan-700 hover:bg-cyan-50"
          >
            Load More
          </Button>
        ) : null}
      </div>
    </div>
  );
}
