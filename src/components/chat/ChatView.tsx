"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Archive, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  CHAT_CHANNEL_STATUS,
  CHAT_CHANNEL_STATUS_LABELS,
  CHAT_MESSAGE_STATUS,
  USER_TYPE,
  type ChatChannelStatus,
} from "../../../lib/constants";
import { formatRelativeTime } from "../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";

type ChatViewProps = {
  channelId: Id<"chat_channels">;
  currentUserId: Id<"users">;
  currentUserRole: string;
  canArchive?: boolean;
  showOriginal?: boolean;
  className?: string;
};

const QUERY_TIMEOUT_MS = 15_000;

function ChannelStatusBadge({ status }: { status: ChatChannelStatus }) {
  const label = CHAT_CHANNEL_STATUS_LABELS[status] ?? status;
  const isActive = status === CHAT_CHANNEL_STATUS.ACTIVE;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-semibold",
        isActive
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-slate-300 bg-slate-50 text-slate-600",
      )}
    >
      <span
        className={cn(
          "mr-1.5 inline-block size-1.5 rounded-full",
          isActive ? "bg-emerald-500" : "bg-slate-400",
        )}
      />
      {label}
    </Badge>
  );
}

export function ChatView({
  channelId,
  currentUserId,
  currentUserRole,
  canArchive = false,
  showOriginal = false,
  className,
}: ChatViewProps) {
  const channel = useQuery(api.chatChannels.getById, { id: channelId });
  const unreadCount = useQuery(api.chatReadReceipts.getUnreadCount, { channel_id: channelId });
  const recentMessages = useQuery(api.chatMessages.listByChannel, {
    channel_id: channelId,
    paginationOpts: { numItems: 30, cursor: null },
  });
  const markRead = useMutation(api.chatReadReceipts.markRead);
  const archiveChannel = useMutation(api.chatChannels.archive);
  const lastMarkedMessageIdRef = useRef<Id<"chat_messages"> | null>(null);
  const [hasQueryTimedOut, setHasQueryTimedOut] = useState(false);

  const isChannelLoading = channel === undefined;
  const isLoading = isChannelLoading;
  const channelStatus = (channel?.status ?? CHAT_CHANNEL_STATUS.ACTIVE) as ChatChannelStatus;
  const isArchived = channelStatus === CHAT_CHANNEL_STATUS.ARCHIVED;
  const newestDeliveredMessage = recentMessages?.page.find(
    (message) =>
      message.status === CHAT_MESSAGE_STATUS.DELIVERED && message.sender_user_id !== currentUserId,
  );

  useEffect(() => {
    if (!newestDeliveredMessage) {
      return;
    }

    if (lastMarkedMessageIdRef.current === newestDeliveredMessage._id) {
      return;
    }

    lastMarkedMessageIdRef.current = newestDeliveredMessage._id;

    void markRead({ channel_id: channelId, message_id: newestDeliveredMessage._id }).catch(() => {
      if (lastMarkedMessageIdRef.current === newestDeliveredMessage._id) {
        lastMarkedMessageIdRef.current = null;
      }
    });
  }, [channelId, newestDeliveredMessage, markRead]);

  // Reset the timeout flag whenever the loading state changes, mirroring the previous
  // effect's dependency array. Adjusting state during render (rather than in an effect)
  // avoids a stale-content flash between the loading state changing and an effect
  // resetting it. See https://react.dev/learn/you-might-not-need-an-effect
  const [prevIsChannelLoading, setPrevIsChannelLoading] = useState(isChannelLoading);
  if (isChannelLoading !== prevIsChannelLoading) {
    setPrevIsChannelLoading(isChannelLoading);
    setHasQueryTimedOut(false);
  }

  useEffect(() => {
    if (!isChannelLoading) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHasQueryTimedOut(true);
    }, QUERY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isChannelLoading]);

  if (isLoading && hasQueryTimedOut) {
    return (
      <Card className={cn("flex flex-col items-center justify-center gap-3 p-8", className)}>
        <AlertTriangle className="size-10 text-amber-400" />
        <p className="text-sm font-medium text-slate-700">Couldn&apos;t connect to chat</p>
        <p className="text-xs text-slate-500">This may be a temporary issue - tap retry.</p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={cn("flex flex-col", className)}>
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-[200px] flex-1" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!channel) {
    return (
      <Card className={cn("flex flex-col items-center justify-center gap-3 p-8", className)}>
        <MessageCircle className="size-10 text-slate-300" />
        <p className="text-sm text-slate-500">Channel not found</p>
      </Card>
    );
  }

  async function handleArchive() {
    try {
      await archiveChannel({ id: channelId });
      toast.success("Channel archived");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive channel");
    }
  }

  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <MessageCircle className="size-5 text-indigo-500" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Chat</h3>
              <ChannelStatusBadge status={channelStatus} />
            </div>
            {channel.created_at && (
              <p className="text-[11px] text-slate-400">
                Opened {formatRelativeTime(channel.created_at)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount !== undefined && unreadCount > 0 && (
            <Badge className="bg-indigo-600 text-white">{unreadCount} unread</Badge>
          )}
          {canArchive && !isArchived && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleArchive}
              className="text-slate-500 hover:text-red-600"
            >
              <Archive className="mr-1 size-4" />
              Archive
            </Button>
          )}
        </div>
      </div>

      <MessageList
        channelId={channelId}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        messages={recentMessages}
        showOriginal={showOriginal}
        className="min-h-[200px] flex-1"
      />

      {channelStatus === CHAT_CHANNEL_STATUS.ACTIVE && currentUserRole !== USER_TYPE.ADMIN && (
        <ChatInput channelId={channelId} channelStatus={channelStatus} />
      )}
    </Card>
  );
}
