"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, Link2, MessageSquare } from "lucide-react";
import { useParams } from "next/navigation";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { USER_TYPE } from "../../../../../../lib/constants";
import { isValidConvexId } from "../../../../../../lib/validators";
import { TenantChatPanel } from "@/components/tenant/messages/tenant-chat-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TenantMessageDetailPage() {
  const params = useParams();
  const channelIdParam = params.channelId;
  const channelId = typeof channelIdParam === "string" ? channelIdParam : "";
  const isValidChannelId = isValidConvexId(channelId);

  const currentUser = useQuery(api.users.getCurrentUser);
  const channel = useQuery(
    api.chatChannels.getById,
    isValidChannelId ? { id: channelId as Id<"chat_channels"> } : "skip",
  );

  if (!isValidChannelId) {
    return (
      <Card className="border-slate-200">
        <CardContent className="space-y-3 py-8 text-center">
          <p className="text-base font-semibold text-slate-900">Invalid channel link</p>
          <p className="text-sm text-slate-600">
            Open the conversation again from your messages inbox.
          </p>
          <Button asChild variant="outline">
            <Link href="/tenant/messages">Back to messages</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (currentUser === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-[460px] w-full" />
      </div>
    );
  }

  if (!currentUser || currentUser.user_type !== USER_TYPE.TENANT) {
    return null;
  }

  if (channel === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-[460px] w-full" />
      </div>
    );
  }

  if (!channel) {
    return (
      <Card className="border-slate-200">
        <CardContent className="space-y-3 py-8 text-center">
          <p className="text-base font-semibold text-slate-900">Conversation not found</p>
          <p className="text-sm text-slate-600">
            This conversation may have been removed or is no longer available for your account.
          </p>
          <Button asChild variant="outline">
            <Link href="/tenant/messages">Back to messages</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <Button asChild variant="ghost" className="-ml-3 w-fit text-slate-600 hover:text-slate-900">
        <Link href="/tenant/messages">
          <ArrowLeft className="size-4" />
          Back to messages
        </Link>
      </Button>

      <header className="space-y-1">
        <div className="flex items-center gap-2 text-cyan-700">
          <MessageSquare className="size-4" />
          <h1 className="text-base font-semibold">Conversation</h1>
        </div>
        <p className="text-sm text-slate-600">
          This conversation is AI-masked for privacy and safety.
        </p>
      </header>

      <Button asChild variant="outline" size="sm" className="border-cyan-200 text-cyan-700">
        <Link href={`/tenant/inquiries/${channel.inquiry_id}`}>
          <Link2 className="mr-1.5 size-4" />
          View related inquiry
        </Link>
      </Button>

      <TenantChatPanel
        channelId={channel._id}
        currentUserId={currentUser._id}
        currentUserRole="TENANT"
        className="h-[calc(100vh-270px)] min-h-[420px]"
      />
    </div>
  );
}
