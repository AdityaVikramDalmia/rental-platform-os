"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Bell, CheckCircle2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

type NotificationItem = {
  _id: Id<"notifications">;
  title: string;
  body: string;
  href: string;
  is_read: boolean;
};

export function NotificationBell() {
  // Bell shows personal notifications for authenticated user — no permission gate needed
  const unread = useQuery(api.notifications.getUnreadCount);
  const feed = useQuery(api.notifications.getMyNotifications, {
    paginationOpts: { numItems: 5, cursor: null },
  });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  if (unread === undefined || feed === undefined) {
    return (
      <button
        type="button"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
      </button>
    );
  }

  const notifications: NotificationItem[] = feed.page.map((item) => ({
    _id: item._id,
    title: item.title,
    body: item.body,
    href: item.action_url ?? "/admin/notifications",
    is_read: item.is_read,
  }));

  const unreadCount = unread.unread_count;
  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
              {badgeLabel}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => markAllRead({})}
            disabled={unreadCount === 0}
          >
            Mark all
          </Button>
        </div>

        {notifications.length > 0 ? (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((notification, index) => (
              <div key={notification._id}>
                <Link
                  href={notification.href}
                  className={`block px-4 py-3 text-sm text-slate-700 transition-colors hover:bg-gray-50 ${notification.is_read ? "bg-white" : "bg-slate-50"}`}
                  onClick={() => markRead({ notification_id: notification._id })}
                >
                  <p className="font-medium text-slate-900">{notification.title}</p>
                  <p className="mt-1 text-slate-600">{notification.body}</p>
                </Link>
                {index < notifications.length - 1 ? (
                  <div className="mx-4 border-b border-slate-100" />
                ) : null}
              </div>
            ))}
            <div className="border-t border-slate-100 p-2">
              <Button asChild variant="ghost" className="h-8 w-full justify-center text-xs">
                <Link href="/admin/notifications">View all notifications</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-slate-400" />
            <span>No new notifications</span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
