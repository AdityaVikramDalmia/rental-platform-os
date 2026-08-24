"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import {
  Calendar,
  ClipboardCheck,
  FileCheck,
  FileText,
  LayoutDashboard,
  Loader2,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { USER_STATUS, USER_TYPE } from "../../../lib/constants";
import { PersonaSwitcher } from "@/components/shared/PersonaSwitcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OpsNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const OPS_NAV_ITEMS: OpsNavItem[] = [
  {
    href: "/ops/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/ops/leads",
    label: "Leads",
    icon: FileText,
  },
  {
    href: "/ops/visits",
    label: "Visits",
    icon: Calendar,
  },
  {
    href: "/ops/closures",
    label: "Closures",
    icon: FileCheck,
  },
  {
    href: "/ops/documents",
    label: "Documents",
    icon: FileText,
  },
  {
    href: "/ops/handover",
    label: "Handover",
    icon: ClipboardCheck,
  },
];

export function OpsLayoutInner({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const currentUser = useQuery(api.users.getCurrentUser);
  const multiPersonaEnabled = useQuery(api.users.isMultiPersonaEnabled);
  const hasOpsPersona =
    currentUser?.user_types?.includes(USER_TYPE.OPS) ?? currentUser?.user_type === USER_TYPE.OPS;
  const isLoading = currentUser === undefined;

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!currentUser || !hasOpsPersona) {
      router.replace("/ops/login");
      return;
    }

    if (currentUser.status === USER_STATUS.BANNED) {
      router.replace("/ops/login?error=banned");
      return;
    }

    if (currentUser.status !== USER_STATUS.ACTIVE) {
      router.replace("/ops/login");
      return;
    }

    if (currentUser.must_change_password && pathname !== "/ops/change-password") {
      router.replace("/ops/change-password");
    }
  }, [currentUser, hasOpsPersona, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !hasOpsPersona) {
    return null;
  }

  if (currentUser.status !== USER_STATUS.ACTIVE) {
    return null;
  }

  if (currentUser.must_change_password && pathname !== "/ops/change-password") {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Rental Platform OS
            </p>
            <p className="text-lg font-semibold text-slate-900">OPS Portal</p>
          </div>
          <div className="flex items-center gap-2">
            {multiPersonaEnabled && (
              <PersonaSwitcher
                userTypes={currentUser.user_types ?? [currentUser.user_type]}
                activePersona={currentUser.active_persona ?? currentUser.user_type}
              />
            )}
            <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Live
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 py-4 pb-28">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-2 pb-safe backdrop-blur">
        <div className="mx-auto grid w-full max-w-md grid-cols-6 gap-1 py-2">
          {OPS_NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Button
                key={item.href}
                asChild
                variant="ghost"
                className={cn(
                  "h-14 min-h-11 min-w-11 flex-col gap-1 rounded-xl px-1 py-2 text-base",
                  isActive
                    ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Link href={item.href}>
                  <Icon className="size-4" />
                  <span className="text-[13px] font-medium leading-none">{item.label}</span>
                </Link>
              </Button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
