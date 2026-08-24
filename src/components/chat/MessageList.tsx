"use client";

import { usePaginatedQuery } from "convex/react";
import { Loader2, MessageCircle } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ChatMessageStatus, ChatSenderRole } from "../../../lib/constants";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MessageBubble, type ChatMessage } from "./MessageBubble";

type PaginatedMessages = {
  page: Array<{
    _id: Id<"chat_messages">;
    channel_id: Id<"chat_channels">;
    sender_user_id: Id<"users">;
    sender_role: ChatSenderRole;
    original_content: string;
    masked_content?: string;
    status: ChatMessageStatus;
    failure_reason?: string;
    admin_review_required: boolean;
    is_ai_processed: boolean;
    created_at: number;
  }>;
  isDone: boolean;
};

type MessageListProps = {
  channelId: Id<"chat_channels">;
  currentUserId: Id<"users">;
  currentUserRole?: string;
  messages?: PaginatedMessages;
  showOriginal?: boolean;
  className?: string;
};

export function MessageList({
  channelId,
  currentUserId,
  currentUserRole,
  messages: incomingMessages,
  showOriginal = false,
  className,
}: MessageListProps) {
  // Only subscribe if messages not provided by parent (ChatView)
  const paginatedQuery = usePaginatedQuery(
    api.chatMessages.listByChannel,
    incomingMessages ? "skip" : { channel_id: channelId },
    { initialNumItems: 30 },
  );

  const messageResults = incomingMessages?.page ?? paginatedQuery.results;
  const messageStatus = incomingMessages
    ? incomingMessages.isDone
      ? "Exhausted"
      : "CanLoadMore"
    : paginatedQuery.status;
  const loadMore = paginatedQuery.loadMore;

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const hasInitialScroll = useRef(false);

  const messages = [...messageResults].reverse();

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (messageStatus === "LoadingFirstPage") return;

    if (!hasInitialScroll.current && messages.length > 0) {
      hasInitialScroll.current = true;
      requestAnimationFrame(scrollToBottom);
      prevLengthRef.current = messages.length;
      return;
    }

    if (messages.length > prevLengthRef.current) {
      const newCount = messages.length - prevLengthRef.current;
      if (newCount <= 3) {
        requestAnimationFrame(scrollToBottom);
      }
    }

    prevLengthRef.current = messages.length;
  }, [messages.length, messageStatus, scrollToBottom]);

  const isLoading = messageStatus === "LoadingFirstPage";
  const isLoadingMore = messageStatus === "LoadingMore";
  const canLoadMore = messageStatus === "CanLoadMore";

  if (isLoading) {
    return (
      <div className={cn("flex flex-1 flex-col gap-3 p-4", className)}>
        {[
          "skeleton-left-a",
          "skeleton-right-b",
          "skeleton-left-c",
          "skeleton-right-d",
          "skeleton-left-e",
        ].map((key, i) => (
          <div key={key} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
            <div className="max-w-[70%] space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className={cn("h-12 rounded-2xl", i % 2 === 0 ? "w-48" : "w-56")} />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className={cn("flex flex-1 flex-col items-center justify-center gap-3 p-8", className)}>
        <div className="rounded-full bg-slate-100 p-4">
          <MessageCircle className="size-8 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-500">No messages yet</p>
        <p className="text-xs text-slate-400">Messages will appear here in real-time</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className={cn("flex flex-1 flex-col overflow-y-auto", className)}>
      {(canLoadMore || isLoadingMore) && (
        <div className="flex justify-center py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => loadMore(20)}
            disabled={isLoadingMore}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="mr-1 size-3 animate-spin" />
                Loading…
              </>
            ) : (
              "Load older messages"
            )}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3 px-4 py-3">
        {messages.map((msg) => {
          const chatMsg: ChatMessage = {
            _id: msg._id,
            channel_id: msg.channel_id,
            sender_user_id: msg.sender_user_id,
            sender_role: msg.sender_role as ChatSenderRole,
            original_content: msg.original_content,
            masked_content: msg.masked_content ?? undefined,
            status: msg.status as ChatMessageStatus,
            failure_reason: msg.failure_reason ?? undefined,
            admin_review_required: msg.admin_review_required,
            is_ai_processed: msg.is_ai_processed,
            created_at: msg.created_at,
          };

          return (
            <MessageBubble
              key={msg._id}
              message={chatMsg}
              isOwnMessage={msg.sender_user_id === currentUserId}
              currentUserRole={currentUserRole}
              showOriginal={showOriginal}
            />
          );
        })}
      </div>
    </div>
  );
}
