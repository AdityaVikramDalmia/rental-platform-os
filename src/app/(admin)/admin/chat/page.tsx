"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import { PERMISSIONS, type ChatChannelStatus } from "../../../../../lib/constants";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { ChannelStatusTabs, type ChannelTab } from "./components/channel-status-tabs";
import { ChannelTable } from "./components/channel-table";

function parseTabParam(param: string | null): ChannelTab {
  if (param === "ACTIVE" || param === "ARCHIVED") return param;
  return "all";
}

export default function ChatManagementPage() {
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
        You do not have permission to access chat management.
      </div>
    );
  }

  return <ChatManagementView />;
}

function ChatManagementView() {
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

  const isLoading = channelLoadStatus === "LoadingFirstPage";
  const isLoadingMore = channelLoadStatus === "LoadingMore";
  const canLoadMore = channelLoadStatus === "CanLoadMore";

  const handleTabChange = useCallback(
    (tab: ChannelTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "all") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const query = params.toString();
      router.replace(query ? `/admin/chat?${query}` : "/admin/chat", {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Chat Management" }]}
      />

      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Chat Management</h2>
        <p className="text-sm text-slate-600">
          View all deal room channels, manage conversations, and review flagged messages.
        </p>
      </div>

      <ChannelStatusTabs activeTab={activeTab} onTabChange={handleTabChange} />

      <ChannelTable
        channels={channels}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        canLoadMore={canLoadMore}
        loadMore={() => loadMore(20)}
      />
    </div>
  );
}
