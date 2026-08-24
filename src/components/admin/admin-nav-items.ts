import {
  AlertTriangle,
  BarChart3,
  Bell,
  BadgeIndianRupee,
  Building2,
  Calendar,
  CheckSquare,
  ClipboardCheck,
  FileSearch,
  FileText,
  HandCoins,
  HeartHandshake,
  Home,
  MessageSquare,
  ScrollText,
  SquareStack,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PERMISSIONS } from "../../../lib/constants";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  available: boolean;
  requiredPermission?: string;
};

export function canAccessAdminNavItem(
  item: Pick<AdminNavItem, "requiredPermission">,
  permissionSet: ReadonlySet<string>,
): boolean {
  return !item.requiredPermission || permissionSet.has(item.requiredPermission);
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: Home, available: true },
  {
    label: "Societies",
    href: "/admin/societies",
    icon: Building2,
    available: true,
    requiredPermission: PERMISSIONS.SOCIETIES_VIEW,
  },
  {
    label: "Guards",
    href: "/admin/guards",
    icon: ShieldCheck,
    available: true,
    requiredPermission: PERMISSIONS.GUARDS_VIEW,
  },
  {
    label: "Owners",
    href: "/admin/owners",
    icon: Users,
    available: true,
    requiredPermission: PERMISSIONS.OWNERS_VIEW,
  },
  {
    label: "RM Dashboard",
    href: "/admin/rm-dashboard",
    icon: HeartHandshake,
    available: true,
    requiredPermission: PERMISSIONS.RM_VIEW,
  },
  {
    label: "Leads",
    href: "/admin/leads",
    icon: FileText,
    available: true,
    requiredPermission: PERMISSIONS.LEADS_VIEW,
  },
  {
    label: "Verification",
    href: "/admin/verification",
    icon: ClipboardCheck,
    available: true,
    requiredPermission: PERMISSIONS.LEADS_VERIFY,
  },
  {
    label: "Listings",
    href: "/admin/listings",
    icon: FileSearch,
    available: true,
    requiredPermission: PERMISSIONS.LISTINGS_VIEW,
  },
  {
    label: "Stale Listings",
    href: "/admin/stale-listings",
    icon: AlertTriangle,
    available: true,
    requiredPermission: PERMISSIONS.TRUST_BADGES_VIEW,
  },
  {
    label: "Visits",
    href: "/admin/visits",
    icon: Calendar,
    available: true,
    requiredPermission: PERMISSIONS.VISITS_VIEW,
  },
  {
    label: "Checklists",
    href: "/admin/checklists",
    icon: CheckSquare,
    available: true,
    requiredPermission: PERMISSIONS.VISITS_VIEW,
  },
  {
    label: "Closures",
    href: "/admin/closures",
    icon: FileText,
    available: true,
    requiredPermission: PERMISSIONS.CLOSURES_VIEW,
  },
  {
    label: "Payouts",
    href: "/admin/payouts",
    icon: HandCoins,
    available: true,
    requiredPermission: PERMISSIONS.PAYOUTS_VIEW,
  },
  {
    label: "Referrals",
    href: "/admin/referrals",
    icon: Users,
    available: true,
    requiredPermission: PERMISSIONS.REFERRALS_VIEW,
  },
  {
    label: "Incentives",
    href: "/admin/incentives",
    icon: BadgeIndianRupee,
    available: true,
    requiredPermission: PERMISSIONS.INCENTIVES_VIEW,
  },
  {
    label: "Incentive Settings",
    href: "/admin/incentive-settings",
    icon: Settings2,
    available: true,
    requiredPermission: PERMISSIONS.COMMISSION_VIEW,
  },
  {
    label: "Analytics",
    href: "/admin/analytics",
    icon: BarChart3,
    available: true,
    requiredPermission: PERMISSIONS.ANALYTICS_VIEW,
  },
  {
    label: "Roles",
    href: "/admin/roles",
    icon: Users,
    available: true,
    requiredPermission: PERMISSIONS.ROLES_VIEW,
  },
  {
    label: "Audit",
    href: "/admin/audit",
    icon: ScrollText,
    available: true,
    requiredPermission: PERMISSIONS.AUDIT_VIEW,
  },
  {
    label: "Inquiries",
    href: "/admin/tenant-inquiries",
    icon: MessageSquare,
    available: true,
    requiredPermission: PERMISSIONS.TENANT_INQUIRIES_VIEW,
  },
  {
    label: "Owner Requests",
    href: "/admin/owner-requests",
    icon: Building2,
    available: true,
    requiredPermission: PERMISSIONS.OWNER_SERVICE_REQUESTS_VIEW,
  },
  {
    label: "Support Inbox",
    href: "/admin/support",
    icon: MessageSquare,
    available: true,
    requiredPermission: PERMISSIONS.SUPPORT_INQUIRIES_VIEW,
  },
  {
    label: "Notifications",
    href: "/admin/notifications",
    icon: Bell,
    available: true,
    requiredPermission: PERMISSIONS.NOTIFICATIONS_VIEW,
  },
  {
    label: "Chat",
    href: "/admin/chat",
    icon: MessageSquare,
    available: true,
    requiredPermission: PERMISSIONS.CHAT_VIEW,
  },
  {
    label: "Chat Monitor",
    href: "/admin/chat-monitor",
    icon: MessageSquare,
    available: true,
    requiredPermission: PERMISSIONS.CHAT_MODERATE,
  },
  {
    label: "Transactions",
    href: "/admin/transactions",
    icon: SquareStack,
    available: true,
    requiredPermission: PERMISSIONS.TRANSACTIONS_VIEW,
  },
  {
    label: "Negotiations",
    href: "/admin/negotiations",
    icon: HeartHandshake,
    available: true,
    requiredPermission: PERMISSIONS.NEGOTIATIONS_VIEW,
  },
  {
    label: "Ops Command Center",
    href: "/admin/ops-command-center",
    icon: Target,
    available: true,
    requiredPermission: PERMISSIONS.OPS_MANAGEMENT_VIEW,
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: SlidersHorizontal,
    available: true,
    requiredPermission: PERMISSIONS.SYSTEM_CONFIGURE,
  },
];
