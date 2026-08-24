"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageCircle,
  MessageSquare,
  Shield,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  CHAT_CHANNEL_STATUS,
  CHAT_CHANNEL_STATUS_LABELS,
  CHAT_MESSAGE_STATUS,
  CHAT_MESSAGE_STATUS_COLORS,
  CHAT_MESSAGE_STATUS_LABELS,
  CHAT_SENDER_ROLE_LABELS,
  PERMISSIONS,
  type ChatChannelStatus,
  type ChatMessageStatus,
  type ChatSenderRole,
} from "../../../../../lib/constants";
import { formatDateTime, formatRelativeTime } from "../../../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChannelTab = "all" | "ACTIVE" | "ARCHIVED";

const CHANNEL_TABS: { key: ChannelTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "ARCHIVED", label: "Archived" },
];

function parseTabParam(param: string | null): ChannelTab {
  if (param === "ACTIVE" || param === "ARCHIVED") return param;
  return "all";
}

export default function ChatMonitorPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );

  const permissionSet = useMemo(() => {
    const permissions = new Set<string>();
    if (!roleAssignments) return permissions;
    for (const assignment of roleAssignments) {
      for (const permission of assignment.role.permissions) {
        permissions.add(permission);
      }
    }
    return permissions;
  }, [roleAssignments]);

  const hasModerate = permissionSet.has(PERMISSIONS.CHAT_MODERATE);
  const hasView = permissionSet.has(PERMISSIONS.CHAT_VIEW);

  if (currentUser === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) {
    return null;
  }

  if (roleAssignments === undefined) {
    return (
      <div className="space-y-3 p-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
    );
  }

  if (!hasModerate || !hasView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to access the chat monitor.
      </div>
    );
  }

  return <ChatMonitorView />;
}

function ChatMonitorView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseTabParam(searchParams.get("tab"));

  const channelStatusFilter = activeTab === "all" ? undefined : (activeTab as ChatChannelStatus);

  const {
    results: channels,
    status: channelLoadStatus,
    loadMore,
  } = usePaginatedQuery(
    api.chatChannels.listForAdmin,
    { status: channelStatusFilter },
    { initialNumItems: 20 },
  );

  const failuresData = useQuery(api.chatAIMonitor.getRecentFailures, {
    paginationOpts: { numItems: 20, cursor: null },
  });

  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);

  const handleTabChange = useCallback(
    (tab: ChannelTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "all") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const query = params.toString();
      router.replace(query ? `/admin/chat-monitor?${query}` : "/admin/chat-monitor", {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const isLoading = channelLoadStatus === "LoadingFirstPage";
  const isLoadingMore = channelLoadStatus === "LoadingMore";
  const canLoadMore = channelLoadStatus === "CanLoadMore";

  const flaggedMessages = failuresData?.messages?.page ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Chat Monitor</h2>
        <p className="text-sm text-slate-600">
          Oversee chat channels, review flagged messages, and moderate conversations.
        </p>
      </div>

      <div className="flex gap-2">
        {CHANNEL_TABS.map((tab) => (
          <Button
            key={tab.key}
            type="button"
            variant={activeTab === tab.key ? "default" : "outline"}
            size="sm"
            onClick={() => handleTabChange(tab.key)}
            className={cn(
              activeTab === tab.key
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "border-slate-300 text-slate-700",
            )}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChannelTable
            channels={channels}
            isLoading={isLoading}
            isLoadingMore={isLoadingMore}
            canLoadMore={canLoadMore}
            loadMore={() => loadMore(20)}
            expandedChannelId={expandedChannelId}
            onToggleExpand={(id) => setExpandedChannelId((prev) => (prev === id ? null : id))}
          />
        </div>

        <div>
          <FlaggedQueue messages={flaggedMessages} />
        </div>
      </div>
    </div>
  );
}

type ChannelRow = {
  _id: Id<"chat_channels">;
  _creationTime: number;
  inquiry_id: Id<"tenant_inquiries">;
  status: string;
  created_at: number;
};

function ChannelTable({
  channels,
  isLoading,
  isLoadingMore,
  canLoadMore,
  loadMore,
  expandedChannelId,
  onToggleExpand,
}: {
  channels: ChannelRow[];
  isLoading: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  loadMore: () => void;
  expandedChannelId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="size-5 text-indigo-500" />
          Channels
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="w-8 px-3 py-2.5 font-medium" />
                <th className="px-3 py-2.5 font-medium">Inquiry</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Created</th>
                <th className="px-3 py-2.5 font-medium">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr
                      key={`channel-skel-${String.fromCharCode(97 + i)}`}
                      className="border-b border-slate-100"
                    >
                      <td className="px-3 py-3">
                        <Skeleton className="size-4" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-28" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                    </tr>
                  ))
                : channels.map((channel) => (
                    <ChannelRow
                      key={channel._id}
                      channel={channel}
                      isExpanded={expandedChannelId === channel._id}
                      onToggle={() => onToggleExpand(channel._id)}
                    />
                  ))}
            </tbody>
          </table>
        </div>

        {!isLoading && channels.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <MessageCircle className="size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No channels found.</p>
          </div>
        )}

        {(canLoadMore || isLoadingMore) && (
          <div className="flex justify-center pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={loadMore}
              disabled={isLoadingMore}
              className="border-slate-300 text-slate-700"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelRow({
  channel,
  isExpanded,
  onToggle,
}: {
  channel: ChannelRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const channelStatus = channel.status as ChatChannelStatus;
  const statusLabel = CHAT_CHANNEL_STATUS_LABELS[channelStatus] ?? channel.status;
  const isActive = channelStatus === CHAT_CHANNEL_STATUS.ACTIVE;

  return (
    <>
      <tr
        className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
        onClick={onToggle}
      >
        <td className="px-3 py-3 text-slate-400">
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </td>
        <td className="px-3 py-3">
          <span className="font-medium text-indigo-600">#{channel.inquiry_id.slice(-6)}</span>
        </td>
        <td className="px-3 py-3">
          <Badge
            variant="outline"
            className={cn(
              "text-xs font-semibold",
              isActive
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-slate-300 bg-slate-50 text-slate-600",
            )}
          >
            {statusLabel}
          </Badge>
        </td>
        <td className="px-3 py-3 text-slate-600">{formatDateTime(channel.created_at)}</td>
        <td className="px-3 py-3 text-slate-600">{formatRelativeTime(channel.created_at)}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={5} className="bg-slate-50/50 px-6 py-4">
            <ExpandedChannelDetail channelId={channel._id} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedChannelDetail({ channelId }: { channelId: Id<"chat_channels"> }) {
  const { results, status } = usePaginatedQuery(
    api.chatMessages.listByChannel,
    { channel_id: channelId },
    { initialNumItems: 10 },
  );

  if (status === "LoadingFirstPage") {
    return (
      <div className="space-y-2">
        {["exp-a", "exp-b", "exp-c"].map((key) => (
          <Skeleton key={key} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return <p className="text-sm text-slate-500">No messages in this channel yet.</p>;
  }

  const messages = [...results].reverse();

  return (
    <div className="space-y-2">
      {messages.map((msg) => (
        <AdminMessageRow key={msg._id} message={msg} />
      ))}
    </div>
  );
}

type RawMessage = {
  _id: string;
  sender_role: string;
  original_content: string;
  masked_content?: string | null;
  status: string;
  admin_review_required: boolean;
  created_at: number;
  failure_reason?: string | null;
};

function AdminMessageRow({ message }: { message: RawMessage }) {
  const msgStatus = message.status as ChatMessageStatus;
  const colorClasses = CHAT_MESSAGE_STATUS_COLORS[msgStatus] ?? "bg-gray-100 text-gray-600";
  const statusLabel = CHAT_MESSAGE_STATUS_LABELS[msgStatus] ?? message.status;
  const roleLabel =
    CHAT_SENDER_ROLE_LABELS[message.sender_role as ChatSenderRole] ?? message.sender_role;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">{roleLabel}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
              colorClasses,
            )}
          >
            {statusLabel}
          </span>
          {message.admin_review_required && (
            <Badge
              variant="outline"
              className="border-orange-300 bg-orange-50 text-[10px] text-orange-700"
            >
              Review Required
            </Badge>
          )}
        </div>
        <span className="text-[11px] text-slate-400">{formatRelativeTime(message.created_at)}</span>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Content</p>
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-800">
            {message.original_content}
          </p>
        </div>
        <div className="rounded-md bg-indigo-50/60 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-indigo-400">Masked</p>
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-800">
            {message.masked_content ?? "—"}
          </p>
        </div>
      </div>

      {message.failure_reason && (
        <p className="mt-1 text-[11px] text-red-500">Reason: {message.failure_reason}</p>
      )}
    </div>
  );
}

function FlaggedQueue({ messages }: { messages: RawMessage[] }) {
  const [approveDialogMsg, setApproveDialogMsg] = useState<RawMessage | null>(null);
  const [rejectDialogMsg, setRejectDialogMsg] = useState<RawMessage | null>(null);

  const reviewRequiredMessages = messages.filter((m) => m.admin_review_required);

  return (
    <>
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-5 text-orange-500" />
            Flagged Messages
            {reviewRequiredMessages.length > 0 && (
              <Badge className="bg-orange-500 text-white">{reviewRequiredMessages.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reviewRequiredMessages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Check className="size-8 text-emerald-400" />
              <p className="text-sm text-slate-500">No messages require review</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reviewRequiredMessages.map((msg) => (
                <div
                  key={msg._id}
                  className="rounded-lg border border-orange-200 bg-orange-50/50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600">
                      {CHAT_SENDER_ROLE_LABELS[msg.sender_role as ChatSenderRole] ??
                        msg.sender_role}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {formatRelativeTime(msg.created_at)}
                    </span>
                  </div>

                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800">
                    {msg.original_content}
                  </p>

                  {msg.masked_content && (
                    <div className="mt-1 rounded bg-white/60 px-2 py-1">
                      <p className="text-[10px] font-medium text-slate-400">AI output attempt:</p>
                      <p className="text-xs text-slate-600">{msg.masked_content}</p>
                    </div>
                  )}

                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setApproveDialogMsg(msg)}
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <Check className="mr-1 size-3" />
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => setRejectDialogMsg(msg)}
                    >
                      <X className="mr-1 size-3" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {approveDialogMsg && (
        <ApproveDialog message={approveDialogMsg} onClose={() => setApproveDialogMsg(null)} />
      )}
      {rejectDialogMsg && (
        <RejectDialog message={rejectDialogMsg} onClose={() => setRejectDialogMsg(null)} />
      )}
    </>
  );
}

function ApproveDialog({ message, onClose }: { message: RawMessage; onClose: () => void }) {
  const approve = useMutation(api.chatAIMonitor.approveMessage);
  const [content, setContent] = useState(message.masked_content ?? message.original_content);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleApprove() {
    if (!content.trim()) {
      toast.error("Approved content cannot be empty");
      return;
    }
    setIsSubmitting(true);
    try {
      await approve({ id: message._id as Id<"chat_messages">, approved_content: content.trim() });
      toast.success("Message approved");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve message");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Approve Message</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Original message
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
              {message.original_content}
            </p>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">
              Approved content (will be shown to recipient)
            </p>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApprove}
            disabled={isSubmitting || !content.trim()}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {isSubmitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            Approve &amp; Deliver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ message, onClose }: { message: RawMessage; onClose: () => void }) {
  const reject = useMutation(api.chatAIMonitor.rejectMessage);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleReject() {
    if (!reason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setIsSubmitting(true);
    try {
      await reject({ id: message._id as Id<"chat_messages">, reason: reason.trim() });
      toast.success("Message rejected");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject message");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reject Message</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Original message
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
              {message.original_content}
            </p>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">Rejection reason</p>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Explain why this message is being rejected…"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleReject}
            disabled={isSubmitting || !reason.trim()}
          >
            {isSubmitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
