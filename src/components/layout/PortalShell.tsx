"use client";

import type { ReactNode } from "react";
import { getPortalConfig } from "@/config/navigation";
import { MobileNav } from "@/components/layout/MobileNav";
import { PortalHeader } from "@/components/layout/PortalHeader";

interface PortalShellProps {
  portalId: "owner" | "tenant";
  portalLabel: string;
  brandLabel?: string;
  userName?: string;
  headerRightSlot?: ReactNode;
  pathname: string;
  children: ReactNode;
  accentClassName?: string;
  navActiveClassName?: string;
}

export function PortalShell({
  portalId,
  portalLabel,
  brandLabel = "Rental Platform OS",
  userName,
  headerRightSlot,
  pathname,
  children,
  accentClassName,
  navActiveClassName,
}: PortalShellProps) {
  const navigationConfig = getPortalConfig(portalId);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <PortalHeader
        portalLabel={portalLabel}
        brandLabel={brandLabel}
        accentClassName={accentClassName}
        userName={userName}
        rightSlot={headerRightSlot}
      />
      <main className="mx-auto w-full max-w-md px-4 py-4 pb-28">{children}</main>
      <MobileNav
        primaryItems={navigationConfig.primaryItems}
        moreItems={navigationConfig.moreItems}
        pathname={pathname}
        activeClassName={navActiveClassName}
      />
    </div>
  );
}
