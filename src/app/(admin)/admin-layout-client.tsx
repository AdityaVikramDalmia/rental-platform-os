"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { Loader2, Menu, Search, X } from "lucide-react";
import {
  CHECKLIST_STATUS,
  LEAD_STATUS,
  PAYOUT_STATUS,
  PERMISSIONS,
  USER_TYPE,
  isBackofficeUser,
} from "../../../lib/constants";
import { api } from "../../../convex/_generated/api";
import { ADMIN_NAV_ITEMS, canAccessAdminNavItem } from "@/components/admin/admin-nav-items";
import { CommandPalette, type CommandPaletteRef } from "@/components/admin/CommandPalette";
import { KeyboardShortcutsDialog } from "@/components/admin/KeyboardShortcutsDialog";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { PersonaSwitcher } from "@/components/shared/PersonaSwitcher";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { KEYBOARD_SHORTCUTS } from "@/lib/keyboard-shortcuts";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

function getNonBackofficeRedirectPath(userType: string | undefined): string {
  switch (userType) {
    case USER_TYPE.GUARD:
      return "/guard/dashboard";
    case USER_TYPE.TENANT:
      return "/";
    case USER_TYPE.OWNER:
      return "/";
    default:
      return "/";
  }
}

export function AdminLayoutInner({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const currentUser = useQuery(api.users.getCurrentUser);
  const multiPersonaEnabled = useQuery(api.users.isMultiPersonaEnabled);
  const hasBackofficePersona =
    currentUser?.user_types?.some((persona) => isBackofficeUser(persona)) ??
    isBackofficeUser(currentUser?.user_type);
  const isBackoffice = hasBackofficePersona;
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser && isBackoffice ? { user_id: currentUser._id } : "skip",
  );
  const isLoading = currentUser === undefined;
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const [pendingChord, setPendingChord] = useState<string | null>(null);
  const commandPaletteRef = useRef<CommandPaletteRef>(null);
  const isMac = useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }

    return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  }, []);

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

  const hasVisitsView = roleAssignments !== undefined && permissionSet.has(PERMISSIONS.VISITS_VIEW);
  const hasChecklistsView = hasVisitsView;
  const todayVisitCount = useQuery(api.visits.getTodayCount, hasVisitsView ? {} : "skip");
  const submittedChecklists = useQuery(
    api.checklists.listForReview,
    hasChecklistsView
      ? {
          status: CHECKLIST_STATUS.SUBMITTED,
          limit: 200,
        }
      : "skip",
  );
  const hasLeadsView = roleAssignments !== undefined && permissionSet.has(PERMISSIONS.LEADS_VIEW);
  const hasPayoutsView =
    roleAssignments !== undefined && permissionSet.has(PERMISSIONS.PAYOUTS_VIEW);
  const hasTenantInquiriesView =
    roleAssignments !== undefined && permissionSet.has(PERMISSIONS.TENANT_INQUIRIES_VIEW);
  const hasOwnerRequestsView =
    roleAssignments !== undefined && permissionSet.has(PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW);
  const hasSupportInquiriesView =
    roleAssignments !== undefined && permissionSet.has(PERMISSIONS.SUPPORT_INQUIRIES_VIEW);

  const submittedLeadsPage = useQuery(
    api.leads.list,
    hasLeadsView
      ? {
          status: LEAD_STATUS.SUBMITTED,
          paginationOpts: { numItems: 200, cursor: null },
        }
      : "skip",
  );

  const initiatedPayoutsPage = useQuery(
    api.payouts.list,
    hasPayoutsView
      ? {
          status: PAYOUT_STATUS.PENDING,
          paginationOpts: { numItems: 200, cursor: null },
        }
      : "skip",
  );

  const submittedInquiriesCount = useQuery(
    api.tenantInquiries.getSubmittedCount,
    hasTenantInquiriesView ? {} : "skip",
  );

  const submittedOwnerRequestsCount = useQuery(
    api.ownerServiceRequests.getSubmittedCount,
    hasOwnerRequestsView ? {} : "skip",
  );

  const openSupportInquiriesCount = useQuery(
    api.supportInquiries.getSubmittedCount,
    hasSupportInquiriesView ? {} : "skip",
  );

  const layoutShortcuts = useMemo(
    () =>
      KEYBOARD_SHORTCUTS.filter((shortcut) =>
        [
          "nav.dashboard",
          "nav.guards",
          "nav.leads",
          "nav.societies",
          "nav.visits",
          "nav.payouts",
          "nav.owners",
          "nav.closures",
          "nav.inquiries",
          "nav.transactions",
          "nav.analytics",
          "nav.negotiations",
          "nav.settings",
          "nav.referrals",
          "nav.audit",
          "nav.checklists",
          "nav.listings",
          "global.shortcutsHelp",
          "global.search",
        ].includes(shortcut.id),
      ),
    [],
  );

  const layoutShortcutHandlers = useMemo<Record<string, () => void>>(
    () => ({
      "nav.dashboard": () => router.push("/admin/dashboard"),
      "nav.guards": () => router.push("/admin/guards"),
      "nav.leads": () => router.push("/admin/leads"),
      "nav.societies": () => router.push("/admin/societies"),
      "nav.visits": () => router.push("/admin/visits"),
      "nav.payouts": () => router.push("/admin/payouts"),
      "nav.owners": () => router.push("/admin/owners"),
      "nav.closures": () => router.push("/admin/closures"),
      "nav.inquiries": () => router.push("/admin/tenant-inquiries"),
      "nav.transactions": () => router.push("/admin/transactions"),
      "nav.analytics": () => router.push("/admin/analytics"),
      "nav.negotiations": () => router.push("/admin/negotiations"),
      "nav.settings": () => router.push("/admin/settings"),
      "nav.referrals": () => router.push("/admin/referrals"),
      "nav.audit": () => router.push("/admin/audit"),
      "nav.checklists": () => router.push("/admin/checklists"),
      "nav.listings": () => router.push("/admin/listings"),
      "global.shortcutsHelp": () => setIsShortcutsHelpOpen(true),
      "global.search": () => {
        if (pathname.startsWith("/admin/leads")) {
          return;
        }

        commandPaletteRef.current?.toggle();
      },
    }),
    [pathname, router],
  );

  const layoutShortcutOptions = useMemo(
    () => ({
      onChordStart: (key: string) => setPendingChord(key),
      onChordEnd: () => setPendingChord(null),
    }),
    [],
  );

  useKeyboardShortcuts(layoutShortcuts, layoutShortcutHandlers, layoutShortcutOptions);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!currentUser) {
      router.replace("/admin/login");
      return;
    }

    if (!hasBackofficePersona) {
      router.replace(getNonBackofficeRedirectPath(currentUser.user_type));
    }
  }, [currentUser, hasBackofficePersona, isLoading, router]);

  const adminDisplayName = useMemo(() => {
    if (!currentUser || !hasBackofficePersona) {
      return "Admin";
    }

    return currentUser.name;
  }, [currentUser, hasBackofficePersona]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !isBackoffice) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside
        className={cn(
          "relative flex flex-col border-r border-slate-200 bg-white transition-[width] duration-300 ease-out",
          isSidebarExpanded ? "w-72" : "w-20",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          {isSidebarExpanded ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Rental Platform OS
              </p>
              <p className="text-sm font-semibold text-slate-800">Admin Panel</p>
            </div>
          ) : (
            <p className="text-lg font-bold text-slate-800">A</p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsSidebarExpanded((prev) => !prev)}
            className="text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            aria-label={isSidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isSidebarExpanded ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {ADMIN_NAV_ITEMS.map((item) => {
            if (!canAccessAdminNavItem(item, permissionSet)) {
              return null;
            }

            const isActive =
              item.available && (pathname === item.href || pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;

            if (!item.available) {
              return (
                <div
                  key={item.href}
                  className={cn(
                    "flex h-11 min-h-11 items-center rounded-lg px-3 text-slate-400",
                    isSidebarExpanded ? "justify-between" : "justify-center",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="size-4" />
                    {isSidebarExpanded ? (
                      <span className="text-sm font-medium">{item.label}</span>
                    ) : null}
                  </div>
                  {isSidebarExpanded ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                      Soon
                    </span>
                  ) : null}
                </div>
              );
            }

            const visitBadgeCount =
              item.href === "/admin/visits" && todayVisitCount !== undefined && todayVisitCount > 0
                ? todayVisitCount
                : null;
            const leadsBadgeCount =
              item.href === "/admin/leads" &&
              submittedLeadsPage !== undefined &&
              submittedLeadsPage.page.length > 0
                ? submittedLeadsPage.page.length
                : null;
            const payoutsBadgeCount =
              item.href === "/admin/payouts" &&
              initiatedPayoutsPage !== undefined &&
              initiatedPayoutsPage.page.length > 0
                ? initiatedPayoutsPage.page.length
                : null;
            const inquiriesBadgeCount =
              item.href === "/admin/tenant-inquiries" &&
              submittedInquiriesCount !== undefined &&
              submittedInquiriesCount > 0
                ? submittedInquiriesCount
                : null;
            const ownerRequestsBadgeCount =
              item.href === "/admin/owner-requests" &&
              submittedOwnerRequestsCount !== undefined &&
              submittedOwnerRequestsCount > 0
                ? submittedOwnerRequestsCount
                : null;
            const supportInquiriesBadgeCount =
              item.href === "/admin/support" &&
              openSupportInquiriesCount !== undefined &&
              openSupportInquiriesCount > 0
                ? openSupportInquiriesCount
                : null;
            const checklistBadgeCount =
              item.href === "/admin/checklists" &&
              submittedChecklists !== undefined &&
              submittedChecklists.length > 0
                ? submittedChecklists.length
                : null;
            const navBadgeCount =
              leadsBadgeCount ??
              payoutsBadgeCount ??
              inquiriesBadgeCount ??
              ownerRequestsBadgeCount ??
              supportInquiriesBadgeCount ??
              checklistBadgeCount ??
              visitBadgeCount;
            const usesRedBadge =
              leadsBadgeCount !== null ||
              payoutsBadgeCount !== null ||
              inquiriesBadgeCount !== null ||
              ownerRequestsBadgeCount !== null ||
              supportInquiriesBadgeCount !== null ||
              checklistBadgeCount !== null;

            return (
              <Button
                key={item.href}
                asChild
                variant="ghost"
                className={cn(
                  "h-11 min-h-11 w-full justify-start gap-3 rounded-lg px-3 text-sm",
                  isSidebarExpanded ? "justify-start" : "justify-center px-0",
                  isActive
                    ? "bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Link href={item.href}>
                  <Icon className="size-4" />
                  {isSidebarExpanded ? (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {navBadgeCount !== null && (
                        <span
                          className={cn(
                            "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                            isActive
                              ? "bg-white/20 text-white"
                              : usesRedBadge
                                ? "bg-red-100 text-red-700"
                                : "bg-blue-100 text-blue-700",
                          )}
                        >
                          {navBadgeCount}
                        </span>
                      )}
                    </>
                  ) : null}
                </Link>
              </Button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 px-3 py-2">
          <button
            type="button"
            onClick={() => setIsShortcutsHelpOpen(true)}
            className="w-full rounded-md py-2 text-center text-xs text-muted-foreground transition-colors hover:bg-slate-100"
          >
            Press ? for shortcuts
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-slate-900">
                Rental Platform OS Operations
              </h1>
              <p className="truncate text-sm text-slate-500">{adminDisplayName}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <NotificationBell />
              </div>
              {multiPersonaEnabled && (
                <PersonaSwitcher
                  userTypes={currentUser.user_types ?? [currentUser.user_type]}
                  activePersona={currentUser.active_persona ?? currentUser.user_type}
                />
              )}
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/80"
                onClick={() => commandPaletteRef.current?.open()}
              >
                <Search className="size-4" />
                <span>Search...</span>
                <span className="rounded bg-background px-1.5 py-0.5 font-mono text-xs text-slate-500">
                  {isMac ? "⌘K" : "Ctrl+K"}
                </span>
              </button>
              <form action={signOutAction}>
                <Button type="submit" variant="outline" className="h-11 min-h-11 px-4">
                  Sign Out
                </Button>
              </form>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-4 md:px-6 md:py-6">{children}</main>
      </div>

      <CommandPalette ref={commandPaletteRef} permissionSet={permissionSet} />
      <KeyboardShortcutsDialog
        open={isShortcutsHelpOpen}
        onOpenChange={setIsShortcutsHelpOpen}
        currentPath={pathname}
      />
      {pendingChord !== null && (
        <div className="animate-in fade-in slide-in-from-bottom-2 fixed bottom-6 left-1/2 z-50 -translate-x-1/2 duration-150">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
            <kbd className="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm font-semibold text-slate-800">
              {pendingChord.toUpperCase()}
            </kbd>
            <span className="text-sm text-slate-500">→ …</span>
          </div>
        </div>
      )}
    </div>
  );
}
