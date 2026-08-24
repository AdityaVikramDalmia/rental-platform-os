"use client";

import { useMutation } from "convex/react";
import { Archive, Eye, Loader2, MessageCircle, MoreHorizontal, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  CHAT_CHANNEL_STATUS,
  CHAT_CHANNEL_STATUS_LABELS,
  type ChatChannelStatus,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type ChannelRowData = {
  _id: Id<"chat_channels">;
  _creationTime: number;
  inquiry_id: Id<"tenant_inquiries">;
  status: string;
  created_at: number;
};

type ChannelTableProps = {
  channels: ChannelRowData[];
  isLoading: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  loadMore: () => void;
};

export function ChannelTable({
  channels,
  isLoading,
  isLoadingMore,
  canLoadMore,
  loadMore,
}: ChannelTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60">
              <th className="px-4 py-3 font-medium text-slate-500">Inquiry</th>
              <th className="px-4 py-3 font-medium text-slate-500">Status</th>
              <th className="px-4 py-3 font-medium text-slate-500">Created</th>
              <th className="px-4 py-3 font-medium text-slate-500">Last Activity</th>
              <th className="px-4 py-3 text-right font-medium text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr
                    key={`skel-${String.fromCharCode(97 + i)}`}
                    className="border-b border-slate-100"
                  >
                    <td className="px-4 py-3.5">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-4 py-3.5">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="px-4 py-3.5">
                      <Skeleton className="h-4 w-28" />
                    </td>
                    <td className="px-4 py-3.5">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-4 py-3.5">
                      <Skeleton className="ml-auto h-8 w-8" />
                    </td>
                  </tr>
                ))
              : channels.map((channel) => <ChannelRow key={channel._id} channel={channel} />)}
          </tbody>
        </table>
      </div>

      {!isLoading && channels.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <MessageCircle className="size-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No channels found</p>
          <p className="text-xs text-slate-500">
            Chat channels are created from the tenant inquiries panel.
          </p>
        </div>
      )}

      {(canLoadMore || isLoadingMore) && (
        <div className="flex justify-center border-t border-slate-100 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="border-slate-300 text-slate-700"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="mr-1 size-3.5 animate-spin" />
                Loading…
              </>
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function ChannelRow({ channel }: { channel: ChannelRowData }) {
  const archiveMut = useMutation(api.chatChannels.archive);
  const reopenMut = useMutation(api.chatChannels.reopen);
  const [confirmAction, setConfirmAction] = useState<"archive" | "reopen" | null>(null);
  const [isPending, setIsPending] = useState(false);

  const channelStatus = channel.status as ChatChannelStatus;
  const statusLabel = CHAT_CHANNEL_STATUS_LABELS[channelStatus] ?? channel.status;
  const isActive = channelStatus === CHAT_CHANNEL_STATUS.ACTIVE;

  async function handleAction(action: "archive" | "reopen") {
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
      toast.error(error instanceof Error ? error.message : `Failed to ${action} channel`);
    } finally {
      setIsPending(false);
      setConfirmAction(null);
    }
  }

  return (
    <>
      <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50/80">
        <td className="px-4 py-3.5">
          <Link
            href={`/admin/tenant-inquiries?id=${channel.inquiry_id}`}
            className="font-mono text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            #{channel.inquiry_id.slice(-6)}
          </Link>
        </td>
        <td className="px-4 py-3.5">
          <Badge
            variant="outline"
            className={cn(
              "text-[11px] font-semibold",
              isActive
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-slate-300 bg-slate-50 text-slate-500",
            )}
          >
            {statusLabel}
          </Badge>
        </td>
        <td className="px-4 py-3.5 text-slate-600">{formatDateTime(channel.created_at)}</td>
        <td className="px-4 py-3.5 text-slate-500">{formatRelativeTime(channel.created_at)}</td>
        <td className="px-4 py-3.5 text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="size-8 p-0">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Open actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/admin/chat/${channel._id}`} className="cursor-pointer">
                  <Eye className="mr-2 size-3.5" />
                  View Detail
                </Link>
              </DropdownMenuItem>
              {isActive ? (
                <DropdownMenuItem
                  onClick={() => setConfirmAction("archive")}
                  className="text-red-600 focus:text-red-600"
                >
                  <Archive className="mr-2 size-3.5" />
                  Archive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setConfirmAction("reopen")}>
                  <RotateCcw className="mr-2 size-3.5" />
                  Reopen
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

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
                ? "Archiving this channel will prevent new messages. Are you sure?"
                : "Reopening this channel will allow participants to send messages again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && handleAction(confirmAction)}
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
