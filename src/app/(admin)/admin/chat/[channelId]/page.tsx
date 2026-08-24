"use client";

import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Archive,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  RotateCcw,
  Send,
  Shield,
  Trash2,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  CHAT_CHANNEL_STATUS,
  CHAT_CHANNEL_STATUS_LABELS,
  CHAT_MESSAGE_STATUS,
  CHAT_MESSAGE_STATUS_COLORS,
  CHAT_MESSAGE_STATUS_LABELS,
  CHAT_SENDER_ROLE,
  CHAT_SENDER_ROLE_LABELS,
  PERMISSIONS,
  type ChatChannelStatus,
  type ChatMessageStatus,
  type ChatSenderRole,
} from "../../../../../../lib/constants";
import { formatDateTime, formatRelativeTime } from "../../../../../../lib/dates";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { cn } from "@/lib/utils";

type SendMode = "system" | "impersonate_tenant" | "impersonate_owner";

export default function ChatDetailPage() {
  const params = useParams();
  const channelId = params.channelId as Id<"chat_channels">;

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

  const hasChatAdmin = permissionSet.has(PERMISSIONS.CHAT_ADMIN);
  const hasChatView = permissionSet.has(PERMISSIONS.CHAT_VIEW);

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

  if (!hasChatView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view chat channels.
      </div>
    );
  }

  return <ChatDetailView channelId={channelId} hasChatAdmin={hasChatAdmin} />;
}

type TranscriptMessage = {
  _id: Id<"chat_messages">;
  _creationTime: number;
  channel_id: Id<"chat_channels">;
  sender_user_id: Id<"users">;
  sender_role: string;
  original_content: string;
  masked_content?: string;
  batch_id?: Id<"chat_message_batches">;
  status: string;
  failure_reason?: string;
  admin_review_required: boolean;
  is_ai_processed: boolean;
  is_impersonated?: boolean;
  impersonated_by_admin_id?: Id<"users">;
  is_deleted?: boolean;
  created_at: number;
  delivered_at?: number;
};

function ChatDetailView({
  channelId,
  hasChatAdmin,
}: {
  channelId: Id<"chat_channels">;
  hasChatAdmin: boolean;
}) {
  const channel = useQuery(api.chatChannels.getById, { id: channelId });
  const transcript = useQuery(
    api.chatMessages.getFullTranscript,
    hasChatAdmin ? { channel_id: channelId } : "skip",
  );

  const inquiry = useQuery(
    api.tenantInquiries.getById,
    channel ? { id: channel.inquiry_id } : "skip",
  );

  const invite = useQuery(
    api.ownerInvites.getForInquiry,
    channel ? { inquiry_id: channel.inquiry_id } : "skip",
  );

  const failuresData = useQuery(api.chatAIMonitor.getRecentFailures, {
    paginationOpts: { numItems: 50, cursor: null },
  });

  if (channel === undefined || (hasChatAdmin && transcript === undefined)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-8 w-80" />
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Skeleton className="h-[500px]" />
          <div className="space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-36" />
          </div>
        </div>
      </div>
    );
  }

  if (channel === null) {
    return (
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: "Admin", href: "/admin/dashboard" },
            { label: "Chat Management", href: "/admin/chat" },
            { label: "Not Found" },
          ]}
        />
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-600">Chat channel not found.</p>
          <Link
            href="/admin/chat"
            className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
          >
            Back to Chat Management
          </Link>
        </div>
      </div>
    );
  }

  const messages = (transcript ?? []) as TranscriptMessage[];
  const channelStatus = channel.status as ChatChannelStatus;
  const isActive = channelStatus === CHAT_CHANNEL_STATUS.ACTIVE;

  const channelFlaggedMessages = messages.filter((m) => m.admin_review_required);

  const allFlaggedMessages = failuresData?.messages?.page ?? [];
  const relevantFlaggedMessages = allFlaggedMessages.filter(
    (m) => m.channel_id.toString() === channelId.toString() && m.admin_review_required,
  );
  const flaggedForReview =
    channelFlaggedMessages.length > 0 ? channelFlaggedMessages : relevantFlaggedMessages;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Chat Management", href: "/admin/chat" },
          { label: `Channel #${channelId.slice(-6)}` },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Channel #{channelId.slice(-6)}
            </h2>
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-semibold",
                isActive
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-slate-300 bg-slate-50 text-slate-500",
              )}
            >
              {CHAT_CHANNEL_STATUS_LABELS[channelStatus] ?? channel.status}
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            Created {formatDateTime(channel.created_at)} &middot;{" "}
            <Link
              href={`/admin/tenant-inquiries?id=${channel.inquiry_id}`}
              className="text-indigo-600 hover:underline"
            >
              View Inquiry #{channel.inquiry_id.slice(-6)}
            </Link>
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <TranscriptPanel
            messages={messages}
            channelId={channelId}
            isActive={isActive}
            hasChatAdmin={hasChatAdmin}
          />

          {hasChatAdmin && isActive && <AdminMessageInput channelId={channelId} />}
        </div>

        <div className="space-y-4">
          <ChannelInfoCard channel={channel} inquiry={inquiry ?? undefined} />

          <QuickActionsCard
            channel={channel}
            invite={invite ?? undefined}
            hasChatAdmin={hasChatAdmin}
          />

          {flaggedForReview.length > 0 && <FlaggedMessagesCard messages={flaggedForReview} />}
        </div>
      </div>
    </div>
  );
}

function TranscriptPanel({
  messages,
  channelId,
  isActive,
  hasChatAdmin,
}: {
  messages: TranscriptMessage[];
  channelId: Id<"chat_channels">;
  isActive: boolean;
  hasChatAdmin: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const deleteMut = useMutation(api.chatMessages.softDeleteMessage);
  const [deletingId, setDeletingId] = useState<Id<"chat_messages"> | null>(null);
  const [isPendingDelete, setIsPendingDelete] = useState(false);
  const prevCountRef = useRef(0);

  if (messages.length !== prevCountRef.current) {
    prevCountRef.current = messages.length;
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }

  async function handleDelete() {
    if (!deletingId) return;
    setIsPendingDelete(true);
    try {
      await deleteMut({ message_id: deletingId });
      toast.success("Message deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete message");
    } finally {
      setIsPendingDelete(false);
      setDeletingId(null);
    }
  }

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-600">
            Transcript ({messages.length} messages)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div
            ref={scrollRef}
            className="max-h-[600px] min-h-[300px] space-y-0.5 overflow-y-auto px-4 py-3"
          >
            {messages.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400">No messages yet</p>
            ) : (
              messages.map((msg) => (
                <MessageBubble
                  key={msg._id}
                  message={msg}
                  hasChatAdmin={hasChatAdmin}
                  onDelete={(id) => setDeletingId(id)}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deletingId !== null} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              This message will be soft-deleted and no longer visible to participants. Admin can
              still see it in the transcript (struck through).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPendingDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPendingDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isPendingDelete ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function senderBg(role: string): string {
  if (role === CHAT_SENDER_ROLE.TENANT) return "bg-blue-50 border-blue-200";
  if (role === CHAT_SENDER_ROLE.OWNER) return "bg-emerald-50 border-emerald-200";
  if (role === CHAT_SENDER_ROLE.SYSTEM) return "bg-slate-50 border-slate-200";
  if (role === CHAT_SENDER_ROLE.OPS) return "bg-violet-50 border-violet-200";
  return "bg-slate-50 border-slate-200";
}

function senderBadgeColor(role: string): string {
  if (role === CHAT_SENDER_ROLE.TENANT) return "bg-blue-100 text-blue-700";
  if (role === CHAT_SENDER_ROLE.OWNER) return "bg-emerald-100 text-emerald-700";
  if (role === CHAT_SENDER_ROLE.SYSTEM) return "bg-slate-200 text-slate-600";
  if (role === CHAT_SENDER_ROLE.OPS) return "bg-violet-100 text-violet-700";
  return "bg-slate-100 text-slate-600";
}

function MessageBubble({
  message,
  hasChatAdmin,
  onDelete,
}: {
  message: TranscriptMessage;
  hasChatAdmin: boolean;
  onDelete: (id: Id<"chat_messages">) => void;
}) {
  const isSystem = message.sender_role === CHAT_SENDER_ROLE.SYSTEM;
  const isDeleted = message.is_deleted === true;
  const isImpersonated = message.is_impersonated === true;
  const isFlagged = message.admin_review_required;
  const isFailed = message.status === CHAT_MESSAGE_STATUS.FAILED;
  const msgStatus = message.status as ChatMessageStatus;
  const roleLabel =
    CHAT_SENDER_ROLE_LABELS[message.sender_role as ChatSenderRole] ?? message.sender_role;

  const hasMaskedDiff =
    message.masked_content && message.masked_content !== message.original_content;

  if (isSystem) {
    return (
      <div className={cn("my-2 flex justify-center", isDeleted && "opacity-50")}>
        <div className="max-w-md rounded-lg bg-slate-100 px-4 py-2 text-center text-xs italic text-slate-500">
          {isDeleted ? (
            <span className="line-through">{message.original_content}</span>
          ) : (
            message.original_content
          )}
          <span className="ml-2 text-[10px] text-slate-400">
            {formatRelativeTime(message.created_at)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative my-1.5 rounded-lg border p-3 transition-colors",
        senderBg(message.sender_role),
        isDeleted && "opacity-50",
        isFlagged && !isDeleted && "border-amber-400 bg-amber-50",
        isFailed && !isDeleted && "border-red-300 bg-red-50",
        isImpersonated && !isDeleted && "border-2 border-amber-500",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            senderBadgeColor(message.sender_role),
          )}
        >
          {roleLabel}
        </span>

        <span
          className={cn(
            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            CHAT_MESSAGE_STATUS_COLORS[msgStatus] ?? "bg-gray-100 text-gray-600",
          )}
        >
          {CHAT_MESSAGE_STATUS_LABELS[msgStatus] ?? message.status}
        </span>

        {isImpersonated && (
          <Badge
            variant="outline"
            className="border-amber-400 bg-amber-100 text-[10px] font-semibold text-amber-800"
          >
            <AlertTriangle className="mr-0.5 size-2.5" />
            Impersonated
          </Badge>
        )}

        {isDeleted && (
          <Badge
            variant="outline"
            className="border-slate-300 bg-slate-100 text-[10px] text-slate-500"
          >
            <Trash2 className="mr-0.5 size-2.5" />
            Deleted
          </Badge>
        )}

        {isFlagged && !isDeleted && (
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-50 text-[10px] text-amber-700"
          >
            <Shield className="mr-0.5 size-2.5" />
            Review Required
          </Badge>
        )}

        <span className="ml-auto text-[10px] text-slate-400">
          {formatRelativeTime(message.created_at)}
        </span>
      </div>

      <div className="mt-2">
        <p
          className={cn("whitespace-pre-wrap text-sm text-slate-800", isDeleted && "line-through")}
        >
          {message.original_content}
        </p>

        {hasMaskedDiff && !isDeleted && (
          <div className="mt-1.5 rounded-md bg-white/60 px-2.5 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Masked
            </span>
            <p className="text-xs text-slate-600">{message.masked_content}</p>
          </div>
        )}

        {message.failure_reason && (
          <p className="mt-1 text-[11px] text-red-500">Reason: {message.failure_reason}</p>
        )}
      </div>

      {hasChatAdmin && !isDeleted && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDelete(message._id)}
          className="absolute right-2 top-2 hidden size-6 p-0 text-slate-400 hover:text-red-600 group-hover:flex"
        >
          <Trash2 className="size-3" />
        </Button>
      )}
    </div>
  );
}

function AdminMessageInput({ channelId }: { channelId: Id<"chat_channels"> }) {
  const sendAsAdmin = useMutation(api.chatMessages.sendAsAdmin);
  const sendImpersonated = useMutation(api.chatMessages.sendImpersonated);

  const [content, setContent] = useState("");
  const [mode, setMode] = useState<SendMode>("system");
  const [skipAi, setSkipAi] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    setIsSending(true);
    try {
      if (mode === "system") {
        await sendAsAdmin({ channel_id: channelId, content: trimmed });
      } else {
        const impersonateAs =
          mode === "impersonate_tenant" ? ("TENANT" as const) : ("OWNER" as const);
        await sendImpersonated({
          channel_id: channelId,
          content: trimmed,
          impersonate_as: impersonateAs,
          skip_ai: skipAi,
        });
      }
      setContent("");
      toast.success("Message sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }, [content, mode, skipAi, channelId, sendAsAdmin, sendImpersonated]);

  const modeLabel =
    mode === "system" ? "DemoRentals" : mode === "impersonate_tenant" ? "Tenant" : "Owner";

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={mode} onValueChange={(v) => setMode(v as SendMode)}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Send as..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Send as DemoRentals</SelectItem>
                <SelectItem value="impersonate_tenant">Impersonate Tenant</SelectItem>
                <SelectItem value="impersonate_owner">Impersonate Owner</SelectItem>
              </SelectContent>
            </Select>

            {mode !== "system" && (
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Checkbox
                  id="skip-ai-checkbox"
                  checked={skipAi}
                  onCheckedChange={(checked) => setSkipAi(checked === true)}
                />
                <label htmlFor="skip-ai-checkbox">Skip AI processing</label>
              </div>
            )}
          </div>

          {mode !== "system" && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
              <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-700">
                You are sending as <strong>{modeLabel}</strong>. The recipient will see this message
                as if it came from the {modeLabel.toLowerCase()}.
              </p>
            </div>
          )}

          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type a message..."
            rows={3}
            disabled={isSending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
          />

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Ctrl+Enter to send</span>
            <Button
              type="button"
              onClick={handleSend}
              disabled={isSending || !content.trim()}
              className={cn(
                "gap-1.5",
                mode !== "system"
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "bg-slate-900 text-white hover:bg-slate-800",
              )}
            >
              {isSending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Send as {modeLabel}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type ChannelDoc = {
  _id: Id<"chat_channels">;
  _creationTime: number;
  inquiry_id: Id<"tenant_inquiries">;
  status: string;
  created_at: number;
  created_by_admin_id: Id<"users">;
};

type InquiryInfo = {
  _id: Id<"tenant_inquiries">;
  tenant_name: string;
  tenant_phone: string;
  tenant_email?: string | null;
  status: string;
  listing?: {
    slug?: string;
    bhk_config?: string;
  } | null;
  building?: {
    name?: string;
  } | null;
};

function ChannelInfoCard({ channel, inquiry }: { channel: ChannelDoc; inquiry?: InquiryInfo }) {
  const channelStatus = channel.status as ChatChannelStatus;
  const isActive = channelStatus === CHAT_CHANNEL_STATUS.ACTIVE;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <User className="size-4 text-slate-400" />
          Channel Info
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 text-sm">
        <InfoLine label="Status">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-semibold",
              isActive
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-slate-300 bg-slate-50 text-slate-500",
            )}
          >
            {CHAT_CHANNEL_STATUS_LABELS[channelStatus] ?? channel.status}
          </Badge>
        </InfoLine>

        <InfoLine label="Created">{formatDateTime(channel.created_at)}</InfoLine>

        <InfoLine label="Inquiry">
          <Link
            href={`/admin/tenant-inquiries?id=${channel.inquiry_id}`}
            className="text-indigo-600 hover:underline"
          >
            #{channel.inquiry_id.slice(-6)}
          </Link>
        </InfoLine>

        {inquiry && (
          <>
            <InfoLine label="Tenant">{inquiry.tenant_name}</InfoLine>
            <InfoLine label="Phone">
              <a
                href={`tel:+91${inquiry.tenant_phone}`}
                className="text-indigo-600 hover:underline"
              >
                +91 {inquiry.tenant_phone}
              </a>
            </InfoLine>
            {inquiry.building?.name && (
              <InfoLine label="Building">{inquiry.building.name}</InfoLine>
            )}
            {inquiry.listing?.bhk_config && (
              <InfoLine label="Config">{inquiry.listing.bhk_config}</InfoLine>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActionsCard({
  channel,
  invite,
  hasChatAdmin,
}: {
  channel: ChannelDoc;
  invite?: {
    _id: Id<"owner_invites">;
    status: string;
    invite_token: string;
    expires_at: number;
  };
  hasChatAdmin: boolean;
}) {
  const archiveMut = useMutation(api.chatChannels.archive);
  const reopenMut = useMutation(api.chatChannels.reopen);
  const generateInviteMut = useMutation(api.ownerInvites.generateInvite);

  const [confirmAction, setConfirmAction] = useState<"archive" | "reopen" | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const channelStatus = channel.status as ChatChannelStatus;
  const isActive = channelStatus === CHAT_CHANNEL_STATUS.ACTIVE;

  const hasPendingInvite = invite?.status === "PENDING";
  const inviteLink = hasPendingInvite
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${invite.invite_token}`
    : null;

  async function handleChannelAction(action: "archive" | "reopen") {
    setIsPending(true);
    try {
      if (action === "archive") {
        await archiveMut({ id: channel._id });
        toast.success("Channel archived");
      } else {
        await reopenMut({ id: channel._id });
        toast.success("Channel reopened");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action}`);
    } finally {
      setIsPending(false);
      setConfirmAction(null);
    }
  }

  async function handleGenerateInvite() {
    setIsGenerating(true);
    try {
      await generateInviteMut({
        inquiry_id: channel.inquiry_id,
        channel_id: channel._id,
      });
      toast.success("Owner invite generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate invite");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-700">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {hasChatAdmin && (
            <>
              {isActive ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 border-red-200 text-red-700 hover:bg-red-50"
                  onClick={() => setConfirmAction("archive")}
                >
                  <Archive className="size-3.5" />
                  Archive Channel
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => setConfirmAction("reopen")}
                >
                  <RotateCcw className="size-3.5" />
                  Reopen Channel
                </Button>
              )}

              {!hasPendingInvite && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={handleGenerateInvite}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Link2 className="size-3.5" />
                  )}
                  Generate Owner Invite
                </Button>
              )}

              {hasPendingInvite && inviteLink && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink);
                    toast.success("Invite link copied");
                  }}
                >
                  <Copy className="size-3.5" />
                  Copy Invite Link
                </Button>
              )}
            </>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            asChild
          >
            <Link href={`/admin/tenant-inquiries?id=${channel.inquiry_id}`}>
              <ExternalLink className="size-3.5" />
              View Inquiry Detail
            </Link>
          </Button>
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "archive" ? "Archive Channel" : "Reopen Channel"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "archive"
                ? "Archiving will prevent all participants from sending new messages."
                : "Reopening will allow participants to resume conversation."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && handleChannelAction(confirmAction)}
              disabled={isPending}
              className={cn(
                confirmAction === "archive"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700",
              )}
            >
              {isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              {confirmAction === "archive" ? "Archive" : "Reopen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FlaggedMessagesCard({
  messages,
}: {
  messages: Array<{
    _id: Id<"chat_messages"> | string;
    sender_role: string;
    original_content: string;
    masked_content?: string | null;
    created_at: number;
    admin_review_required: boolean;
  }>;
}) {
  const [approveMsg, setApproveMsg] = useState<(typeof messages)[number] | null>(null);
  const [rejectMsg, setRejectMsg] = useState<(typeof messages)[number] | null>(null);

  const reviewable = messages.filter((m) => m.admin_review_required);

  if (reviewable.length === 0) return null;

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/30 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <Shield className="size-4 text-amber-600" />
            Flagged Messages
            <Badge className="bg-amber-500 text-[10px] text-white">{reviewable.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {reviewable.map((msg) => (
            <div
              key={msg._id.toString()}
              className="rounded-lg border border-amber-200 bg-white p-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-500">
                  {CHAT_SENDER_ROLE_LABELS[msg.sender_role as ChatSenderRole] ?? msg.sender_role}
                </span>
                <span className="text-[10px] text-slate-400">
                  {formatRelativeTime(msg.created_at)}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-700">{msg.original_content}</p>
              <div className="mt-2 flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-6 bg-emerald-600 px-2 text-[10px] text-white hover:bg-emerald-700"
                  onClick={() => setApproveMsg(msg)}
                >
                  <Check className="mr-0.5 size-2.5" />
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setRejectMsg(msg)}
                >
                  <X className="mr-0.5 size-2.5" />
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {approveMsg && (
        <ApproveDialog
          messageId={approveMsg._id as Id<"chat_messages">}
          originalContent={approveMsg.original_content}
          maskedContent={approveMsg.masked_content ?? undefined}
          onClose={() => setApproveMsg(null)}
        />
      )}
      {rejectMsg && (
        <RejectDialog
          messageId={rejectMsg._id as Id<"chat_messages">}
          originalContent={rejectMsg.original_content}
          onClose={() => setRejectMsg(null)}
        />
      )}
    </>
  );
}

function ApproveDialog({
  messageId,
  originalContent,
  maskedContent,
  onClose,
}: {
  messageId: Id<"chat_messages">;
  originalContent: string;
  maskedContent?: string;
  onClose: () => void;
}) {
  const approve = useMutation(api.chatAIMonitor.approveMessage);
  const [content, setContent] = useState(maskedContent ?? originalContent);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleApprove() {
    if (!content.trim()) {
      toast.error("Approved content cannot be empty");
      return;
    }
    setIsSubmitting(true);
    try {
      await approve({ id: messageId, approved_content: content.trim() });
      toast.success("Message approved");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve");
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
              Original
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{originalContent}</p>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">
              Approved content (visible to recipient)
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

function RejectDialog({
  messageId,
  originalContent,
  onClose,
}: {
  messageId: Id<"chat_messages">;
  originalContent: string;
  onClose: () => void;
}) {
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
      await reject({ id: messageId, reason: reason.trim() });
      toast.success("Message rejected");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject");
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
              Original
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{originalContent}</p>
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

function InfoLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-right text-xs font-medium text-slate-800">{children}</span>
    </div>
  );
}
