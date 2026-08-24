"use client";

import { useQuery } from "convex/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_EVENT_STATUS,
  PERMISSIONS,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationEventStatus,
} from "../../../../../lib/constants";
import { formatDateTime, formatRelativeTime } from "../../../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type MonitorTab = "EVENTS" | "DEAD_LETTER";
type StatusTab = "ALL" | NotificationEventStatus;
type ChannelFilter = "ALL" | NotificationChannel;
type CategoryFilter = "ALL" | NotificationCategory;

const MONITOR_TABS: Array<{ label: string; value: MonitorTab }> = [
  { label: "Events", value: "EVENTS" },
  { label: "Dead Letter", value: "DEAD_LETTER" },
];

const STATUS_TABS: Array<{ label: string; value: StatusTab }> = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: NOTIFICATION_EVENT_STATUS.PENDING },
  { label: "Processing", value: NOTIFICATION_EVENT_STATUS.PROCESSING },
  { label: "Delivered", value: NOTIFICATION_EVENT_STATUS.DELIVERED },
  { label: "Failed", value: NOTIFICATION_EVENT_STATUS.FAILED },
  { label: "Suppressed", value: NOTIFICATION_EVENT_STATUS.SUPPRESSED },
];

const STATUS_STYLES: Record<string, string> = {
  [NOTIFICATION_EVENT_STATUS.PENDING]: "bg-amber-100 text-amber-800",
  [NOTIFICATION_EVENT_STATUS.PROCESSING]: "bg-blue-100 text-blue-800",
  [NOTIFICATION_EVENT_STATUS.DELIVERED]: "bg-emerald-100 text-emerald-800",
  [NOTIFICATION_EVENT_STATUS.FAILED]: "bg-red-100 text-red-800",
  [NOTIFICATION_EVENT_STATUS.DEAD_LETTER]: "bg-rose-100 text-rose-800",
  [NOTIFICATION_EVENT_STATUS.SUPPRESSED]: "bg-slate-200 text-slate-700",
};

function toDateInputValue(ms: number | undefined): string {
  if (!ms) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).formatToParts(new Date(ms));
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function parseDateStart(value: string): number | undefined {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00+05:30`).getTime();
}

function parseDateEnd(value: string): number | undefined {
  if (!value) return undefined;
  return new Date(`${value}T23:59:59.999+05:30`).getTime();
}

export default function AdminNotificationsPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );

  const permissionSet = useMemo(() => {
    const permissions = new Set<string>();
    if (!roleAssignments) {
      return permissions;
    }

    for (const assignment of roleAssignments) {
      for (const permission of assignment.role.permissions) {
        permissions.add(permission);
      }
    }

    return permissions;
  }, [roleAssignments]);

  const hasViewPermission = permissionSet.has(PERMISSIONS.NOTIFICATIONS_VIEW);

  const [monitorTab, setMonitorTab] = useState<MonitorTab>("EVENTS");
  const [statusTab, setStatusTab] = useState<StatusTab>("ALL");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [dateFrom, setDateFrom] = useState<number | undefined>(undefined);
  const [dateTo, setDateTo] = useState<number | undefined>(undefined);
  const [eventsCursor, setEventsCursor] = useState<string | null>(null);
  const [deadLetterCursor, setDeadLetterCursor] = useState<string | null>(null);

  const fromTs = dateFrom;
  const toTs = dateTo;

  const shouldFetchMonitor =
    hasViewPermission &&
    !!currentUser &&
    (currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ??
      (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"));

  const events = useQuery(
    api.notifications.adminList,
    shouldFetchMonitor
      ? {
          status: statusTab === "ALL" ? undefined : statusTab,
          channel: channelFilter === "ALL" ? undefined : channelFilter,
          category: categoryFilter === "ALL" ? undefined : categoryFilter,
          from_ts: fromTs,
          to_ts: toTs,
          paginationOpts: {
            numItems: 20,
            cursor: eventsCursor,
          },
        }
      : ("skip" as const),
  );

  const deadLetter = useQuery(
    api.notifications.adminGetDeadLetter,
    shouldFetchMonitor
      ? {
          channel: channelFilter === "ALL" ? undefined : channelFilter,
          from_ts: fromTs,
          to_ts: toTs,
          paginationOpts: {
            numItems: 20,
            cursor: deadLetterCursor,
          },
        }
      : ("skip" as const),
  );

  if (currentUser === undefined || roleAssignments === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (
    !currentUser ||
    !(
      currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ??
      (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS")
    )
  ) {
    return null;
  }

  if (!hasViewPermission) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view notifications.
      </div>
    );
  }

  const activeData = monitorTab === "EVENTS" ? events : deadLetter;
  const isLoading = activeData === undefined;
  const canLoadMore = !!activeData && !activeData.isDone && activeData.continueCursor !== null;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Notifications Monitor
        </h2>
        <p className="text-sm text-slate-600">
          Observe queue health, delivery outcomes, and dead-lettered events across channels.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {MONITOR_TABS.map((tab) => {
          const isActive = monitorTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setMonitorTab(tab.value);
                setEventsCursor(null);
                setDeadLetterCursor(null);
              }}
              className={cn(
                "inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <Select
              value={statusTab}
              onValueChange={(value) => {
                setStatusTab(value as StatusTab);
                setEventsCursor(null);
              }}
              disabled={monitorTab === "DEAD_LETTER"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_TABS.map((tab) => (
                  <SelectItem key={tab.value} value={tab.value}>
                    {tab.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={channelFilter}
              onValueChange={(value) => {
                setChannelFilter(value as ChannelFilter);
                setEventsCursor(null);
                setDeadLetterCursor(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All channels</SelectItem>
                {Object.values(NOTIFICATION_CHANNEL).map((channel) => (
                  <SelectItem key={channel} value={channel}>
                    {channel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={categoryFilter}
              onValueChange={(value) => {
                setCategoryFilter(value as CategoryFilter);
                setEventsCursor(null);
              }}
              disabled={monitorTab === "DEAD_LETTER"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {Object.values(NOTIFICATION_CATEGORY).map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <DatePicker
                value={toDateInputValue(dateFrom)}
                onChange={(value) => {
                  setDateFrom(parseDateStart(value));
                  setEventsCursor(null);
                  setDeadLetterCursor(null);
                }}
                placeholder="From"
              />
              <DatePicker
                value={toDateInputValue(dateTo)}
                onChange={(value) => {
                  setDateTo(parseDateEnd(value));
                  setEventsCursor(null);
                  setDeadLetterCursor(null);
                }}
                placeholder="To"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {monitorTab === "EVENTS" ? "Event Queue" : "Dead Letter Queue"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {monitorTab === "DEAD_LETTER" ? (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertTriangle className="size-4" />
              <span>These events exhausted retries or failed with non-retryable errors.</span>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Event</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium">Severity</th>
                  <th className="px-3 py-2.5 font-medium">Channels</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Last Error</th>
                  <th className="px-3 py-2.5 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                      <div className="inline-flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        Loading notifications...
                      </div>
                    </td>
                  </tr>
                ) : activeData.page.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                      No notification events found.
                    </td>
                  </tr>
                ) : (
                  activeData.page.map((event) => (
                    <tr key={event._id} className="border-b border-slate-100 text-slate-800">
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-900">{event.event_type}</div>
                        <div className="text-xs text-slate-500">{event._id}</div>
                      </td>
                      <td className="px-3 py-3">{event.category}</td>
                      <td className="px-3 py-3">{event.severity}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {event.channels.map((channel: NotificationChannel) => {
                            const perChannel = event.channel_status?.[channel];
                            return (
                              <Badge
                                key={`${event._id}-${channel}`}
                                variant="outline"
                                className="text-xs"
                              >
                                {channel}
                                {perChannel
                                  ? `:${perChannel.status}(${perChannel.attempt_count})`
                                  : ""}
                              </Badge>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                            STATUS_STYLES[event.status] ?? "bg-slate-100 text-slate-700",
                          )}
                        >
                          {event.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {event.final_error ?? event.last_error ?? "-"}
                      </td>
                      <td
                        className="px-3 py-3 text-xs text-slate-500"
                        title={formatDateTime(event.created_at)}
                      >
                        {formatRelativeTime(event.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {canLoadMore && activeData ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (monitorTab === "EVENTS") {
                    setEventsCursor(activeData.continueCursor);
                    return;
                  }
                  setDeadLetterCursor(activeData.continueCursor);
                }}
              >
                Load More
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
