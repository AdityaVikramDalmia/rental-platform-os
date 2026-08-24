"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { formatRelativeTime } from "../../../../../lib/dates";
import { USER_TYPE } from "../../../../../lib/constants";
import { TenantActivityFeed } from "@/components/tenant/dashboard/tenant-activity-feed";
import { TenantKpiCards } from "@/components/tenant/dashboard/tenant-kpi-cards";
import { TenantUpcomingVisitsCard } from "@/components/tenant/dashboard/tenant-upcoming-visits-card";
import { TenantMoreSheet } from "@/components/tenant/tenant-more-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type TenantDashboardSummary = {
  inquiry_counts: Record<string, number>;
  open_inquiries_count: number;
  upcoming_visits_count: number;
  upcoming_visits: Array<{
    visit_id: Id<"visits">;
    listing_title: string;
    scheduled_date: number;
    status: string;
  }>;
  favorites_count: number;
  unread_messages_count: number;
  recent_activity: Array<{
    activity_type: "INQUIRY" | "VISIT" | "FAVORITE" | "CHAT";
    label: string;
    timestamp: number;
    href: string;
  }>;
};

type CachedDashboardPayload = {
  savedAt: number;
  summary: TenantDashboardSummary;
};

const DASHBOARD_CACHE_KEY_PREFIX = "tenant-dashboard-summary-v2-";
const CACHE_TTL_MS = 10 * 60 * 1000;

function getDashboardCacheKey(userId: string): string {
  return `${DASHBOARD_CACHE_KEY_PREFIX}${userId}`;
}

type DashboardBoundaryProps = {
  children: React.ReactNode;
};

type DashboardBoundaryState = {
  hasError: boolean;
  retryKey: number;
};

class TenantDashboardErrorBoundary extends React.Component<
  DashboardBoundaryProps,
  DashboardBoundaryState
> {
  state: DashboardBoundaryState = {
    hasError: false,
    retryKey: 0,
  };

  static getDerivedStateFromError(): Pick<DashboardBoundaryState, "hasError"> {
    return { hasError: true };
  }

  private handleRetry = () => {
    this.setState((previousState) => ({
      hasError: false,
      retryKey: previousState.retryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-amber-200 bg-amber-50/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <AlertTriangle className="size-4" />
              Unable to load dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-amber-800">
            <p>Couldn&apos;t load your dashboard summary. Check your connection and try again.</p>
            <Button
              type="button"
              variant="outline"
              onClick={this.handleRetry}
              className="h-11 min-h-11 min-w-11 border-amber-300 bg-white"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      );
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}

function getTimeGreeting(): "morning" | "afternoon" | "evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function TenantDashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const currentUser = useQuery(api.users.getCurrentUser);
  const unreadCounts = useQuery(
    api.tenantInbox.getUnreadCount,
    currentUser && currentUser.user_type === USER_TYPE.TENANT ? {} : "skip",
  );
  const summary = useQuery(api.tenantDashboard.getSummary);
  const trackDashboardViewed = useMutation(api.tenantDashboard.trackDashboardViewed);
  const hasTrackedViewRef = useRef(false);
  const [cachedPayload, setCachedPayload] = useState<CachedDashboardPayload | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const cacheKey = currentUser?._id ? getDashboardCacheKey(String(currentUser._id)) : null;

  useEffect(() => {
    if (typeof window === "undefined" || !cacheKey) {
      return;
    }

    const cachedRaw = window.localStorage.getItem(cacheKey);
    if (!cachedRaw) {
      return;
    }

    try {
      const parsed = JSON.parse(cachedRaw) as CachedDashboardPayload;
      const isStale =
        typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > CACHE_TTL_MS;

      if (isStale) {
        window.localStorage.removeItem(cacheKey);
        return;
      }

      if (parsed.summary) {
        // Reads localStorage (unavailable at SSR time), keyed by an async-resolved
        // cacheKey; this genuinely reacts to that external store becoming available.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCachedPayload(parsed);
      }
    } catch {
      window.localStorage.removeItem(cacheKey);
    }
  }, [cacheKey]);

  useEffect(() => {
    if (summary === undefined || typeof window === "undefined" || !cacheKey) {
      return;
    }

    const nextPayload: CachedDashboardPayload = {
      savedAt: Date.now(),
      summary,
    };

    // Mirrors the freshly-loaded summary into localStorage (an external store) so it
    // survives a later reload; updating in-memory state alongside that write is the
    // same external sync, not a per-render state derivation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCachedPayload(nextPayload);
    window.localStorage.setItem(cacheKey, JSON.stringify(nextPayload));
  }, [summary, cacheKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateOnlineState = () => {
      setIsOffline(!window.navigator.onLine);
    };

    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    if (hasTrackedViewRef.current) {
      return;
    }

    if (!currentUser || currentUser.user_type !== USER_TYPE.TENANT) {
      return;
    }

    hasTrackedViewRef.current = true;

    void trackDashboardViewed().catch(() => {
      hasTrackedViewRef.current = false;
    });
  }, [currentUser, trackDashboardViewed]);

  const resolvedSummary = summary ?? cachedPayload?.summary;
  const resolvedUnreadMessagesCount =
    unreadCounts?.total ?? resolvedSummary?.unread_messages_count ?? 0;
  const showingCachedData = summary === undefined && cachedPayload !== null;

  const tenantName = currentUser?.name?.trim() || "there";

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          {currentUser === undefined ? (
            <>
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-44" />
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Good {getTimeGreeting()}, {tenantName}
              </h1>
              <p className="text-sm text-slate-600">Your inquiry and visit summary at a glance</p>
            </>
          )}
        </div>
        <TenantMoreSheet pathname={pathname} />
      </header>

      {showingCachedData && cachedPayload ? (
        <Card className="border-amber-200 bg-amber-50/70 shadow-sm">
          <CardContent className="flex items-center justify-between gap-3 p-3 text-sm text-amber-900">
            <div>
              <p className="font-medium">Showing cached dashboard data</p>
              <p className="text-xs text-amber-800">
                Last updated {formatRelativeTime(cachedPayload.savedAt)}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.refresh()}
              className="h-11 min-h-11 min-w-11 border-amber-300 bg-white"
            >
              <RefreshCw className="mr-1.5 size-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isOffline && !showingCachedData ? (
        <p className="text-xs font-medium text-slate-500">
          Offline mode. Reconnecting automatically...
        </p>
      ) : null}

      <TenantKpiCards
        summary={
          resolvedSummary
            ? {
                open_inquiries_count: resolvedSummary.open_inquiries_count,
                upcoming_visits_count: resolvedSummary.upcoming_visits_count,
                favorites_count: resolvedSummary.favorites_count,
                unread_messages_count: resolvedUnreadMessagesCount,
              }
            : undefined
        }
      />

      {resolvedSummary && resolvedSummary.open_inquiries_count === 0 ? (
        <Card className="border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50 shadow-sm">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold text-slate-900">Start your rental journey</p>
            <p className="text-sm text-slate-600">
              Browse verified listings and submit your first inquiry to unlock visits and deal-room
              updates.
            </p>
            <Button
              asChild
              className="h-11 min-h-11 min-w-11 bg-cyan-600 text-white hover:bg-cyan-700"
            >
              <Link href="/listings">Browse listings</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <TenantUpcomingVisitsCard visits={resolvedSummary?.upcoming_visits} />

      <TenantActivityFeed activity={resolvedSummary?.recent_activity} />
    </div>
  );
}

export default function TenantDashboardPage() {
  return (
    <TenantDashboardErrorBoundary>
      <TenantDashboardContent />
    </TenantDashboardErrorBoundary>
  );
}
