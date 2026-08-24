"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { isPortalNavActive, type PortalNavItem } from "@/config/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  primaryItems: PortalNavItem[];
  moreItems: PortalNavItem[];
  pathname: string;
  onNavigate?: () => void;
  activeClassName?: string;
}

const NAV_SLOT_KEYS = ["primary-1", "primary-2", "primary-3", "primary-4", "primary-5"] as const;

export function MobileNav({
  primaryItems,
  moreItems,
  pathname,
  onNavigate,
  activeClassName,
}: MobileNavProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const navSlots = useMemo(() => {
    const visibleItems = primaryItems.slice(0, 5);
    return NAV_SLOT_KEYS.map((_, index) => visibleItems[index] ?? null);
  }, [primaryItems]);

  const moreTriggerItem = navSlots[4];
  const showMoreTrigger = Boolean(moreTriggerItem) && moreItems.length > 0;
  const resolvedActiveClassName =
    activeClassName ?? "bg-slate-900 text-white hover:bg-slate-800 hover:text-white";
  const isMoreActive =
    showMoreTrigger &&
    ((moreTriggerItem ? isPortalNavActive(pathname, moreTriggerItem) : false) ||
      moreItems.some((item) => isPortalNavActive(pathname, item)));

  function handleNavigate() {
    onNavigate?.();
  }

  function handleMoreItemNavigate() {
    setIsMoreOpen(false);
    onNavigate?.();
  }

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-safe backdrop-blur">
        <div className="mx-auto grid w-full max-w-md grid-cols-5 gap-1 py-2">
          {NAV_SLOT_KEYS.map((slotKey, index) => {
            const item = navSlots[index];

            if (!item) {
              return <div key={slotKey} className="h-14 min-h-11 min-w-11" />;
            }

            const Icon = item.icon;

            if (index === 4 && showMoreTrigger) {
              return (
                <Button
                  key={item.id}
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsMoreOpen(true);
                    handleNavigate();
                  }}
                  className={cn(
                    "h-14 min-h-11 min-w-11 flex-col gap-1 rounded-xl px-1 py-2 text-base",
                    isMoreActive
                      ? resolvedActiveClassName
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <Icon className="size-4" />
                  <span className="text-[13px] font-medium leading-none">{item.label}</span>
                </Button>
              );
            }

            const isActive = isPortalNavActive(pathname, item);

            return (
              <Button
                key={item.id}
                asChild
                variant="ghost"
                className={cn(
                  "h-14 min-h-11 min-w-11 flex-col gap-1 rounded-xl px-1 py-2 text-base",
                  isActive
                    ? resolvedActiveClassName
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Link href={item.href} onClick={handleNavigate}>
                  <Icon className="size-4" />
                  <span className="text-[13px] font-medium leading-none">{item.label}</span>
                </Link>
              </Button>
            );
          })}
        </div>
      </nav>

      {showMoreTrigger && (
        <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl px-0 pb-safe">
            <SheetHeader className="px-4 pb-2">
              <SheetTitle>More</SheetTitle>
            </SheetHeader>
            <div className="px-2 pb-4">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = isPortalNavActive(pathname, item);

                return (
                  <Button
                    key={item.id}
                    asChild
                    variant="ghost"
                    className={cn(
                      "h-12 min-h-11 w-full justify-start gap-3 rounded-xl px-3 text-sm",
                      isActive
                        ? resolvedActiveClassName
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    <Link href={item.href} onClick={handleMoreItemNavigate}>
                      <Icon className="size-4" />
                      <span>{item.label}</span>
                    </Link>
                  </Button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
