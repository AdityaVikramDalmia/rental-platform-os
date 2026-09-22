"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2, MessageSquare } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { USER_STATUS, USER_TYPE } from "../../../lib/constants";
import { getPortalConfig } from "@/config/navigation";
import { MobileNav } from "@/components/layout/MobileNav";
import { PortalHeader } from "@/components/layout/PortalHeader";
import { PersonaSwitcher } from "@/components/shared/PersonaSwitcher";
import { useTenantFavoritesSync } from "@/lib/hooks/use-tenant-favorites-sync";

function BadgedMessageIcon({ className, count }: { className?: string; count: number }) {
  return (
    <span className="relative inline-flex">
      <MessageSquare className={className} />
      {count > 0 ? (
        <span className="absolute -right-2 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-600 px-1 text-[10px] font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </span>
  );
}

export function TenantLayoutInner({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useTenantFavoritesSync();

  const router = useRouter();
  const pathname = usePathname();
  const currentUser = useQuery(api.users.getCurrentUser);
  const hasTenantPersona =
    currentUser?.user_types?.includes(USER_TYPE.TENANT) ??
    currentUser?.user_type === USER_TYPE.TENANT;
  const multiPersonaEnabled = (currentUser?.user_types?.length ?? 0) > 1;
  const unreadCounts = useQuery(
    api.tenantInbox.getUnreadCount,
    currentUser && hasTenantPersona ? {} : "skip",
  );
  const isLoading = currentUser === undefined;
  const unreadTotal = unreadCounts?.total ?? 0;
  const tenantPortalConfig = useMemo(() => getPortalConfig("tenant"), []);

  const navItems = useMemo(() => {
    return tenantPortalConfig.primaryItems.map((item) => {
      if (item.id !== "tenant-messages") {
        return item;
      }

      return {
        ...item,
        icon: ({ className }: { className?: string }) => (
          <BadgedMessageIcon className={className} count={unreadTotal} />
        ),
      };
    });
  }, [tenantPortalConfig.primaryItems, unreadTotal]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!currentUser || !hasTenantPersona) {
      router.replace(currentUser ? "/tenant/login?error=role_mismatch" : "/tenant/login");
    }
  }, [currentUser, hasTenantPersona, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !hasTenantPersona) {
    return null;
  }

  if (currentUser.status !== USER_STATUS.ACTIVE) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto w-full max-w-md px-4 py-6">
          <div className="rounded-xl border border-cyan-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Tenant account inactive</h2>
            <p className="mt-2 text-sm text-slate-600">
              Your tenant account is not active right now. Please contact support for help.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <PortalHeader
        portalLabel={tenantPortalConfig.title}
        brandLabel="Rental Platform OS"
        accentClassName="text-cyan-700"
        userName={currentUser.name}
        rightSlot={
          multiPersonaEnabled ? (
            <PersonaSwitcher
              userTypes={currentUser.user_types ?? [currentUser.user_type]}
              activePersona={currentUser.active_persona ?? currentUser.user_type}
            />
          ) : null
        }
      />
      <main className="mx-auto w-full max-w-md px-4 py-4 pb-28">{children}</main>
      <MobileNav
        primaryItems={navItems}
        moreItems={tenantPortalConfig.moreItems}
        pathname={pathname}
        activeClassName="bg-cyan-600 text-white hover:bg-cyan-700 hover:text-white"
      />
    </div>
  );
}
