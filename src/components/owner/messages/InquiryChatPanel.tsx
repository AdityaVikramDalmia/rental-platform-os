"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import React from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ChatView } from "@/components/chat/ChatView";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface InquiryChatPanelProps {
  channelId: Id<"chat_channels">;
  ownerMode: boolean;
  showBackLink?: boolean;
}

type InquiryChatPanelBoundaryState = {
  hasError: boolean;
};

class InquiryChatPanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  InquiryChatPanelBoundaryState
> {
  state: InquiryChatPanelBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): InquiryChatPanelBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-red-200 bg-red-50/70">
          <CardContent className="space-y-2 p-4 text-sm text-red-700">
            <p className="font-semibold">Unable to open conversation</p>
            <p>This conversation is unavailable or you do not have access to it.</p>
            <Button asChild variant="outline" className="border-red-200 bg-white text-red-700">
              <Link href="/owner/messages">Back to inbox</Link>
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

function InquiryChatPanelInner({ channelId, ownerMode, showBackLink }: InquiryChatPanelProps) {
  const currentUser = useQuery(api.users.getCurrentUser);
  const channel = useQuery(api.chatChannels.getById, { id: channelId });

  if (currentUser === undefined || channel === undefined) {
    return (
      <Card className="border-indigo-100">
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-[360px] w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!currentUser) {
    return (
      <Card className="border-red-200 bg-red-50/70">
        <CardContent className="space-y-2 p-4 text-sm text-red-700">
          <p className="font-semibold">Session unavailable</p>
          <p>Please sign in again to continue this conversation.</p>
        </CardContent>
      </Card>
    );
  }

  if (!channel) {
    return (
      <Card className="border-slate-200 bg-white">
        <CardContent className="space-y-2 p-6 text-center">
          <MessageCircle className="mx-auto size-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">Conversation not found</p>
          <p className="text-xs text-slate-500">This channel may no longer exist.</p>
          <Button asChild variant="outline" className="mt-2">
            <Link href="/owner/messages">Back to inbox</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {showBackLink ? (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="px-0 text-indigo-700 hover:text-indigo-800"
        >
          <Link href="/owner/messages" className="inline-flex items-center gap-1.5">
            <ArrowLeft className="size-4" />
            Back to inbox
          </Link>
        </Button>
      ) : null}

      <ChatView
        channelId={channelId}
        currentUserId={currentUser._id}
        currentUserRole={currentUser.user_type}
        canArchive={false}
        showOriginal={false}
        className={ownerMode ? "h-[calc(100vh-220px)] min-h-[420px]" : "h-[420px]"}
      />
    </div>
  );
}

export function InquiryChatPanel(props: InquiryChatPanelProps) {
  return (
    <InquiryChatPanelErrorBoundary>
      <InquiryChatPanelInner {...props} />
    </InquiryChatPanelErrorBoundary>
  );
}
