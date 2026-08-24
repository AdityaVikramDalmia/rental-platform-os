"use client";

import { useQuery } from "convex/react";
import {
  AlertCircle,
  AlertTriangle,
  BadgeIndianRupee,
  Banknote,
  BarChart3,
  Bell,
  Building2,
  Calendar,
  CalendarCheck,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  FileSearch,
  FileText,
  HandCoins,
  HeartHandshake,
  Home,
  Loader2,
  MessageSquare,
  ScrollText,
  Search as SearchIcon,
  Settings2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  SquareStack,
  Target,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { LEAD_STATUS, USER_STATUS } from "../../../lib/constants";
import { formatPhoneDisplay } from "../../../lib/validators";
import { ADMIN_NAV_ITEMS, canAccessAdminNavItem } from "@/components/admin/admin-nav-items";
import { KEYBOARD_SHORTCUTS } from "@/lib/keyboard-shortcuts";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export type CommandPaletteRef = {
  open: () => void;
  close: () => void;
  toggle: () => void;
};

type CommandPaletteProps = {
  permissionSet: ReadonlySet<string>;
};

type RecentCommandItem = {
  label: string;
  path: string;
  icon: string;
};

const RECENT_STORAGE_KEY = "admin_cmd_recent";
const MAX_RECENT_ITEMS = 5;

const NAV_SHORTCUT_ROUTE_MAP: Record<string, string> = {
  dashboard: "/admin/dashboard",
  guards: "/admin/guards",
  leads: "/admin/leads",
  societies: "/admin/societies",
  visits: "/admin/visits",
  payouts: "/admin/payouts",
  owners: "/admin/owners",
  closures: "/admin/closures",
  inquiries: "/admin/tenant-inquiries",
  transactions: "/admin/transactions",
  analytics: "/admin/analytics",
  negotiations: "/admin/negotiations",
  settings: "/admin/settings",
  referrals: "/admin/referrals",
  audit: "/admin/audit",
  checklists: "/admin/checklists",
  listings: "/admin/listings",
};

const CHORD_HINTS_BY_PATH: Record<string, string> = (() => {
  const hints: Record<string, string> = {};

  for (const shortcut of KEYBOARD_SHORTCUTS) {
    if (!shortcut.chord || !shortcut.id.startsWith("nav.")) {
      continue;
    }

    const navKey = shortcut.id.replace("nav.", "");
    const path = NAV_SHORTCUT_ROUTE_MAP[navKey];

    if (!path) {
      continue;
    }

    hints[path] = shortcut.chord.map((key) => key.toUpperCase()).join(" ");
  }

  return hints;
})();

const NAV_ICON_NAMES_BY_PATH: Record<string, string> = {
  "/admin/dashboard": "Home",
  "/admin/societies": "Building2",
  "/admin/guards": "ShieldCheck",
  "/admin/owners": "Users",
  "/admin/rm-dashboard": "HeartHandshake",
  "/admin/leads": "FileText",
  "/admin/verification": "ClipboardCheck",
  "/admin/listings": "FileSearch",
  "/admin/stale-listings": "AlertTriangle",
  "/admin/visits": "Calendar",
  "/admin/checklists": "CheckSquare",
  "/admin/closures": "FileText",
  "/admin/payouts": "HandCoins",
  "/admin/referrals": "Users",
  "/admin/incentives": "BadgeIndianRupee",
  "/admin/incentive-settings": "Settings2",
  "/admin/analytics": "BarChart3",
  "/admin/roles": "Users",
  "/admin/audit": "ScrollText",
  "/admin/tenant-inquiries": "MessageSquare",
  "/admin/owner-requests": "Building2",
  "/admin/support": "MessageSquare",
  "/admin/notifications": "Bell",
  "/admin/chat": "MessageSquare",
  "/admin/chat-monitor": "MessageSquare",
  "/admin/transactions": "SquareStack",
  "/admin/negotiations": "HeartHandshake",
  "/admin/ops-command-center": "Target",
  "/admin/settings": "SlidersHorizontal",
};

const QUICK_ACTIONS: Array<{
  label: string;
  path: string;
  icon: LucideIcon;
  iconName: string;
}> = [
  {
    label: "Pending Leads",
    path: "/admin/leads?status=SUBMITTED",
    icon: ClipboardList,
    iconName: "ClipboardList",
  },
  {
    label: "Today's Visits",
    path: "/admin/visits?date=today",
    icon: CalendarCheck,
    iconName: "CalendarCheck",
  },
  {
    label: "Pending Payouts",
    path: "/admin/payouts?status=pending",
    icon: Banknote,
    iconName: "Banknote",
  },
  {
    label: "Unverified Leads",
    path: "/admin/leads?status=NEED_INFO",
    icon: AlertCircle,
    iconName: "AlertCircle",
  },
  {
    label: "Active Guards",
    path: "/admin/guards?status=ACTIVE",
    icon: Shield,
    iconName: "Shield",
  },
];

const RECENT_ICON_MAP: Record<string, LucideIcon> = {
  AlertCircle,
  AlertTriangle,
  BadgeIndianRupee,
  Banknote,
  BarChart3,
  Bell,
  Building2,
  Calendar,
  CalendarCheck,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  FileSearch,
  FileText,
  HandCoins,
  HeartHandshake,
  Home,
  MessageSquare,
  ScrollText,
  SearchIcon,
  Settings2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  SquareStack,
  Target,
  Users,
};

function parseRecentItems(value: string | null): RecentCommandItem[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is RecentCommandItem => {
        if (typeof item !== "object" || item === null) {
          return false;
        }

        const candidate = item as Partial<RecentCommandItem>;
        return (
          typeof candidate.label === "string" &&
          typeof candidate.path === "string" &&
          typeof candidate.icon === "string"
        );
      })
      .slice(0, MAX_RECENT_ITEMS);
  } catch {
    return [];
  }
}

export const CommandPalette = forwardRef<CommandPaletteRef, CommandPaletteProps>(
  function CommandPalette({ permissionSet }, ref) {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [searchValue, setSearchValue] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [recentItems, setRecentItems] = useState<RecentCommandItem[]>(() =>
      typeof window === "undefined"
        ? []
        : parseRecentItems(window.localStorage.getItem(RECENT_STORAGE_KEY)),
    );

    const navigationItems = useMemo(() => {
      return ADMIN_NAV_ITEMS.filter(
        (item) => item.available && canAccessAdminNavItem(item, permissionSet),
      );
    }, [permissionSet]);

    const shouldSearch = debouncedSearch.length >= 2;

    const guardSearchResults = useQuery(
      api.guards.search,
      shouldSearch ? { search: debouncedSearch } : "skip",
    );
    const leadSearchResults = useQuery(
      api.leads.list,
      shouldSearch
        ? {
            paginationOpts: { numItems: 5, cursor: null },
            search: debouncedSearch,
          }
        : "skip",
    );
    const societySearchResults = useQuery(
      api.societies.search,
      shouldSearch ? { search: debouncedSearch } : "skip",
    );

    const guards = shouldSearch
      ? (guardSearchResults ?? [])
          .filter((guard) => guard.status !== USER_STATUS.BANNED)
          .slice(0, 5)
      : [];
    const leads = shouldSearch
      ? (leadSearchResults?.page ?? [])
          .filter((lead) => lead.status !== LEAD_STATUS.REJECTED)
          .slice(0, 5)
      : [];
    const societies = shouldSearch ? (societySearchResults ?? []).slice(0, 5) : [];
    const isSearching =
      shouldSearch &&
      (guardSearchResults === undefined ||
        leadSearchResults === undefined ||
        societySearchResults === undefined);

    useImperativeHandle(ref, () => ({
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((prev) => !prev),
    }));

    useEffect(() => {
      const handler = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          setIsOpen((prev) => !prev);
        }
      };

      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, []);

    useEffect(() => {
      const timeout = window.setTimeout(() => {
        setDebouncedSearch(searchValue.trim());
      }, 300);

      return () => window.clearTimeout(timeout);
    }, [searchValue]);

    const addRecentItem = (item: RecentCommandItem) => {
      setRecentItems((previous) => {
        const deduped = previous.filter((entry) => entry.path !== item.path);
        const next = [item, ...deduped].slice(0, MAX_RECENT_ITEMS);

        if (typeof window !== "undefined") {
          window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
        }

        return next;
      });
    };

    const navigateTo = (item: RecentCommandItem) => {
      addRecentItem(item);
      router.push(item.path);
      setIsOpen(false);
    };

    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setSearchValue("");
            setDebouncedSearch("");
          }
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-2xl" showCloseButton={false}>
          <Command>
            <CommandInput
              value={searchValue}
              onValueChange={setSearchValue}
              placeholder="Search pages, guards, leads..."
            />
            <CommandList>
              {recentItems.length > 0 ? (
                <CommandGroup heading="Recent">
                  {recentItems.map((item) => {
                    const Icon = RECENT_ICON_MAP[item.icon] ?? SearchIcon;

                    return (
                      <CommandItem
                        key={`${item.path}:${item.label}`}
                        value={item.label.toLowerCase()}
                        onSelect={() => navigateTo(item)}
                      >
                        <Icon className="size-4" />
                        <span className="flex-1">{item.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}

              {recentItems.length > 0 ? <CommandSeparator /> : null}

              <CommandGroup heading="Navigation">
                {navigationItems.map((item) => {
                  const Icon = item.icon;
                  const chordHint = CHORD_HINTS_BY_PATH[item.href];

                  return (
                    <CommandItem
                      key={item.href}
                      value={item.label.toLowerCase()}
                      onSelect={() =>
                        navigateTo({
                          label: item.label,
                          path: item.href,
                          icon: NAV_ICON_NAMES_BY_PATH[item.href] ?? "SearchIcon",
                        })
                      }
                    >
                      <Icon className="size-4" />
                      <span className="flex-1">{item.label}</span>
                      {chordHint ? (
                        <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {chordHint}
                        </kbd>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Quick Actions">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;

                  return (
                    <CommandItem
                      key={action.path}
                      value={action.label.toLowerCase()}
                      onSelect={() =>
                        navigateTo({
                          label: action.label,
                          path: action.path,
                          icon: action.iconName,
                        })
                      }
                    >
                      <Icon className="size-4" />
                      <span className="flex-1">{action.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              {shouldSearch ? <CommandSeparator /> : null}

              {isSearching ? (
                <CommandGroup heading="Search">
                  <CommandItem disabled value="searching">
                    <Loader2 className="size-4 animate-spin" />
                    <span>Searching...</span>
                  </CommandItem>
                </CommandGroup>
              ) : null}

              {guards.length > 0 ? (
                <CommandGroup heading="Guards">
                  {guards.map((guard) => (
                    <CommandItem
                      key={guard.user_id}
                      value={`${guard.name} ${guard.phone ?? ""}`.toLowerCase()}
                      onSelect={() =>
                        navigateTo({
                          label: guard.name,
                          path: `/admin/guards/${guard.user_id}`,
                          icon: "ShieldCheck",
                        })
                      }
                    >
                      <SearchIcon className="size-4" />
                      <span className="flex-1">{guard.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {guard.phone ? formatPhoneDisplay(guard.phone) : "No phone"}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {leads.length > 0 ? (
                <CommandGroup heading="Leads">
                  {leads.map((lead) => (
                    <CommandItem
                      key={lead._id}
                      value={`${lead.flat_number} ${lead.building_name ?? ""} ${lead.society_name ?? ""}`.toLowerCase()}
                      onSelect={() =>
                        navigateTo({
                          label: `${lead.flat_number}${lead.building_name ? `, ${lead.building_name}` : ""}`,
                          path: `/admin/leads?id=${lead._id}`,
                          icon: "FileText",
                        })
                      }
                    >
                      <SearchIcon className="size-4" />
                      <span className="flex-1">
                        {lead.flat_number}
                        {lead.building_name ? `, ${lead.building_name}` : ""}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {lead.society_name ?? ""}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {societies.length > 0 ? (
                <CommandGroup heading="Societies">
                  {societies.map((society) => (
                    <CommandItem
                      key={society._id}
                      value={`${society.name} ${society.city}`.toLowerCase()}
                      onSelect={() =>
                        navigateTo({
                          label: society.name,
                          path: `/admin/societies/${society._id}`,
                          icon: "Building2",
                        })
                      }
                    >
                      <SearchIcon className="size-4" />
                      <span className="flex-1">{society.name}</span>
                      <span className="text-muted-foreground text-xs">{society.city}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              <CommandEmpty>No results found.</CommandEmpty>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    );
  },
);
