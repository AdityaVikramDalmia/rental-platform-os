"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ChatView } from "@/components/chat/ChatView";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type TenantChatPanelProps = {
  inquiryId?: Id<"tenant_inquiries">;
  channelId?: Id<"chat_channels">;
  currentUserId: Id<"users">;
  currentUserRole: "TENANT" | "OWNER" | "OPS" | "ADMIN";
  className?: string;
};

const LONG_LOAD_MS = 5_000;
const SLOW_LOAD_MS = 15_000;
const FAIL_LOAD_MS = 30_000;

type QueryLoadingState = "loading" | "takingLonger" | "slowConnection" | "timeout";

type TenantChatPanelBoundaryState = {
  hasError: boolean;
};

class TenantChatPanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  TenantChatPanelBoundaryState
> {
  state: TenantChatPanelBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): TenantChatPanelBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-red-200 bg-red-50/70">
          <CardContent className="space-y-3 p-4 text-sm text-red-700">
            <p className="font-semibold">Couldn&apos;t connect to chat</p>
            <p>This may be a temporary issue - tap retry.</p>
            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-11 min-w-11 border-red-300 bg-white"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

function TenantChatPanelInner({
  inquiryId,
  channelId,
  currentUserId,
  currentUserRole,
  className,
}: TenantChatPanelProps) {
  const router = useRouter();
  const [queryLoadingState, setQueryLoadingState] = useState<QueryLoadingState>("loading");
  const trackedChannelRef = useRef<string | null>(null);
  const trackChatOpened = useMutation(api.chatChannels.trackTenantChatOpened);

  const directChannel = useQuery(api.chatChannels.getById, channelId ? { id: channelId } : "skip");
  const inquiryChannel = useQuery(
    api.chatChannels.getByInquiryForTenant,
    inquiryId ? { inquiry_id: inquiryId } : "skip",
  );

  const resolvedChannel = channelId ? directChannel : inquiryChannel;
  const isQueryLoading = resolvedChannel === undefined;

  // Reset the loading state whenever the query's loading status changes, mirroring the
  // previous effect's dependency array. Adjusting state during render (rather than in an
  // effect) avoids a stale-content flash between the loading status changing and an
  // effect resetting it. See https://react.dev/learn/you-might-not-need-an-effect
  const [prevIsQueryLoading, setPrevIsQueryLoading] = useState(isQueryLoading);
  if (isQueryLoading !== prevIsQueryLoading) {
    setPrevIsQueryLoading(isQueryLoading);
    setQueryLoadingState("loading");
  }

  useEffect(() => {
    if (!isQueryLoading) {
      return;
    }

    const takingLongerTimeoutId = window.setTimeout(() => {
      setQueryLoadingState("takingLonger");
    }, LONG_LOAD_MS);

    const slowConnectionTimeoutId = window.setTimeout(() => {
      setQueryLoadingState("slowConnection");
    }, SLOW_LOAD_MS);

    const timeoutId = window.setTimeout(() => {
      setQueryLoadingState("timeout");
    }, FAIL_LOAD_MS);

    return () => {
      window.clearTimeout(takingLongerTimeoutId);
      window.clearTimeout(slowConnectionTimeoutId);
      window.clearTimeout(timeoutId);
    };
  }, [isQueryLoading]);

  useEffect(() => {
    if (!resolvedChannel) {
      return;
    }

    const channelKey = String(resolvedChannel._id);
    if (trackedChannelRef.current === channelKey) {
      return;
    }

    trackedChannelRef.current = channelKey;

    void trackChatOpened({ channel_id: resolvedChannel._id }).catch(() => {
      if (trackedChannelRef.current === channelKey) {
        trackedChannelRef.current = null;
      }
    });
  }, [resolvedChannel, trackChatOpened]);

  if (!channelId && !inquiryId) {
    return (
      <Card className={cn("border-slate-200", className)}>
        <CardContent className="space-y-2 p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">No chat selected</p>
          <p className="text-xs text-slate-500">Open a conversation from the messages inbox.</p>
        </CardContent>
      </Card>
    );
  }

  if (isQueryLoading && queryLoadingState === "timeout") {
    return (
      <Card className={cn("border-amber-200 bg-amber-50/70", className)}>
        <CardContent className="space-y-3 p-6 text-center">
          <AlertTriangle className="mx-auto size-8 text-amber-500" />
          <p className="text-sm font-semibold text-amber-900">Couldn&apos;t connect to chat</p>
          <p className="text-xs text-amber-800">This may be a temporary issue - tap retry.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.refresh()}
            className="h-11 min-h-11 min-w-11 border-amber-300 bg-white"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isQueryLoading) {
    const helperCopy =
      queryLoadingState === "takingLonger"
        ? "Taking longer than expected..."
        : queryLoadingState === "slowConnection"
          ? "Connection may be slow, please wait..."
          : null;

    return (
      <Card className={cn("border-cyan-100", className)}>
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-[360px] w-full" />
          <Skeleton className="h-10 w-full" />
          {helperCopy ? <p className="text-xs text-cyan-800">{helperCopy}</p> : null}
        </CardContent>
      </Card>
    );
  }

  if (!resolvedChannel) {
    const isInquiryEntry = inquiryId !== undefined;

    return (
      <Card className={cn("border-slate-200 bg-white", className)}>
        <CardContent className="space-y-2 p-6 text-center">
          <MessageCircle className="mx-auto size-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">
            {isInquiryEntry ? "No messages yet" : "Conversation unavailable"}
          </p>
          <p className="text-xs text-slate-500">
            {isInquiryEntry
              ? "A channel will appear here once your inquiry is picked up by the team."
              : "This channel may be archived, unavailable, or not accessible from your account."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ChatView
      channelId={resolvedChannel._id}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      showOriginal={false}
      className={cn("h-[420px]", className)}
    />
  );
}

export function TenantChatPanel(props: TenantChatPanelProps) {
  return (
    <TenantChatPanelErrorBoundary>
      <TenantChatPanelInner {...props} />
    </TenantChatPanelErrorBoundary>
  );
}
