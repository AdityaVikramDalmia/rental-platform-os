import { USER_TYPE } from "../../lib/constants";
import {
  Building2,
  FileText,
  FolderOpen,
  Headphones,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  Share2,
  Star,
  User,
  Wallet,
} from "lucide-react";
import type { ComponentType } from "react";

export type FieldWorkerNavIcon =
  | "home"
  | "submitLead"
  | "leads"
  | "visits"
  | "bounties"
  | "earnings";

export type FieldWorkerNavLabelKey =
  | "nav.home"
  | "nav.addLead"
  | "nav.myLeads"
  | "nav.myVisits"
  | "nav.earnings";

export type FieldWorkerNavItem = {
  href: string;
  icon: FieldWorkerNavIcon;
  labelKey?: FieldWorkerNavLabelKey;
  label?: string;
  visibleTo: readonly string[];
};

// P44-CONFLICT-RISK: Field worker nav items will likely change during OPS superset navigation expansion.
export const FIELD_WORKER_NAV_ITEMS: readonly FieldWorkerNavItem[] = [
  {
    href: "/guard/dashboard",
    icon: "home",
    labelKey: "nav.home",
    visibleTo: [USER_TYPE.GUARD, USER_TYPE.OPS],
  },
  {
    href: "/guard/submit-lead",
    icon: "submitLead",
    labelKey: "nav.addLead",
    visibleTo: [USER_TYPE.GUARD, USER_TYPE.OPS],
  },
  {
    href: "/guard/leads",
    icon: "leads",
    labelKey: "nav.myLeads",
    visibleTo: [USER_TYPE.GUARD, USER_TYPE.OPS],
  },
  {
    href: "/guard/visits",
    icon: "visits",
    labelKey: "nav.myVisits",
    visibleTo: [USER_TYPE.GUARD, USER_TYPE.OPS],
  },
  {
    href: "/guard/bounties",
    icon: "bounties",
    label: "Bounties",
    visibleTo: [USER_TYPE.GUARD, USER_TYPE.OPS],
  },
  {
    href: "/guard/earnings",
    icon: "earnings",
    labelKey: "nav.earnings",
    visibleTo: [USER_TYPE.GUARD, USER_TYPE.OPS],
  },
];

export function getFieldWorkerNavItems(userType: string): FieldWorkerNavItem[] {
  return FIELD_WORKER_NAV_ITEMS.filter((item) =>
    item.visibleTo.some((visibleUserType) => visibleUserType === userType),
  );
}

export type PortalId = "owner" | "tenant";

export type PortalNavItem = {
  id: string;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  isPrimary: boolean;
  matchPaths: string[];
};

export type PortalNavigationConfig = {
  portalId: PortalId;
  primaryItems: PortalNavItem[];
  moreItems: PortalNavItem[];
  title: string;
};

const OWNER_MORE_ITEMS: PortalNavItem[] = [
  {
    id: "owner-leads",
    label: "Leads",
    href: "/owner/leads",
    icon: FileText,
    isPrimary: false,
    matchPaths: ["/owner/leads"],
  },
  {
    id: "owner-referrals",
    label: "Referrals",
    href: "/owner/referrals",
    icon: Share2,
    isPrimary: false,
    matchPaths: ["/owner/referrals"],
  },
  {
    id: "owner-requests",
    label: "Requests",
    href: "/owner/service-requests",
    icon: Headphones,
    isPrimary: false,
    matchPaths: ["/owner/service-requests"],
  },
  {
    id: "owner-documents",
    label: "Documents",
    href: "/owner/documents",
    icon: FolderOpen,
    isPrimary: false,
    matchPaths: ["/owner/documents"],
  },
  {
    id: "owner-profile",
    label: "Profile",
    href: "/owner/profile",
    icon: User,
    isPrimary: false,
    matchPaths: ["/owner/profile"],
  },
];

const TENANT_MORE_ITEMS: PortalNavItem[] = [
  {
    id: "tenant-visits",
    label: "Visits",
    href: "/tenant/visits",
    icon: Building2,
    isPrimary: false,
    matchPaths: ["/tenant/visits"],
  },
  {
    id: "tenant-favorites",
    label: "Favorites",
    href: "/tenant/favorites",
    icon: Star,
    isPrimary: false,
    matchPaths: ["/tenant/favorites"],
  },
  {
    id: "tenant-referrals",
    label: "Referrals",
    href: "/tenant/referrals",
    icon: Share2,
    isPrimary: false,
    matchPaths: ["/tenant/referrals"],
  },
  {
    id: "tenant-tools",
    label: "Tools",
    href: "/tenant/tools",
    icon: Star,
    isPrimary: false,
    matchPaths: ["/tenant/tools"],
  },
  {
    id: "tenant-profile",
    label: "Profile",
    href: "/tenant/profile",
    icon: User,
    isPrimary: false,
    matchPaths: ["/tenant/profile"],
  },
];

const PORTAL_NAVIGATION_CONFIG: Record<PortalId, PortalNavigationConfig> = {
  owner: {
    portalId: "owner",
    title: "Owner Portal",
    primaryItems: [
      {
        id: "owner-dashboard",
        label: "Dashboard",
        href: "/owner/dashboard",
        icon: LayoutDashboard,
        isPrimary: true,
        matchPaths: ["/owner/dashboard"],
      },
      {
        id: "owner-properties",
        label: "Properties",
        href: "/owner/properties",
        icon: Building2,
        isPrimary: true,
        matchPaths: ["/owner/properties"],
      },
      {
        id: "owner-earnings",
        label: "Earnings",
        href: "/owner/earnings",
        icon: Wallet,
        isPrimary: true,
        matchPaths: ["/owner/earnings"],
      },
      {
        id: "owner-messages",
        label: "Messages",
        href: "/owner/messages",
        icon: MessageSquare,
        isPrimary: true,
        matchPaths: ["/owner/messages"],
      },
      {
        id: "owner-more",
        label: "More",
        href: "#owner-more",
        icon: MoreHorizontal,
        isPrimary: true,
        matchPaths: OWNER_MORE_ITEMS.flatMap((item) => item.matchPaths),
      },
    ],
    moreItems: OWNER_MORE_ITEMS,
  },
  tenant: {
    portalId: "tenant",
    title: "Tenant Portal",
    primaryItems: [
      {
        id: "tenant-dashboard",
        label: "Dashboard",
        href: "/tenant/dashboard",
        icon: LayoutDashboard,
        isPrimary: true,
        matchPaths: ["/tenant/dashboard"],
      },
      {
        id: "tenant-inquiries",
        label: "Inquiries",
        href: "/tenant/inquiries",
        icon: FileText,
        isPrimary: true,
        matchPaths: ["/tenant/inquiries"],
      },
      {
        id: "tenant-transactions",
        label: "Transactions",
        href: "/tenant/transactions",
        icon: FileText,
        isPrimary: true,
        matchPaths: ["/tenant/transactions"],
      },
      {
        id: "tenant-messages",
        label: "Messages",
        href: "/tenant/messages",
        icon: MessageSquare,
        isPrimary: true,
        matchPaths: ["/tenant/messages"],
      },
      {
        id: "tenant-more",
        label: "More",
        href: "#tenant-more",
        icon: MoreHorizontal,
        isPrimary: true,
        matchPaths: TENANT_MORE_ITEMS.flatMap((item) => item.matchPaths),
      },
    ],
    moreItems: TENANT_MORE_ITEMS,
  },
};

export function getPortalConfig(portalId: PortalId): PortalNavigationConfig {
  return PORTAL_NAVIGATION_CONFIG[portalId];
}

export function isPortalNavActive(pathname: string, navItem: PortalNavItem): boolean {
  return navItem.matchPaths.some((matchPath) => {
    return pathname === matchPath || pathname.startsWith(`${matchPath}/`);
  });
}
