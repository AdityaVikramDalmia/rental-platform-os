"use client";

import Link from "next/link";
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { getPortalConfig, isPortalNavActive, type PortalNavItem } from "@/config/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type TenantMoreSheetProps = {
  pathname: string;
  items?: PortalNavItem[];
  triggerLabel?: string;
  triggerClassName?: string;
};

const defaultMoreItems = getPortalConfig("tenant").moreItems;

export function TenantMoreSheet({
  pathname,
  items = defaultMoreItems,
  triggerLabel = "More",
  triggerClassName,
}: TenantMoreSheetProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className={cn(
          "h-11 min-h-11 min-w-11 border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 hover:text-cyan-800",
          triggerClassName,
        )}
      >
        <MoreHorizontal className="mr-1.5 size-4" />
        {triggerLabel}
      </Button>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-0 pb-safe">
          <SheetHeader className="px-4 pb-2">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="px-2 pb-4">
            {items.map((item) => {
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
                      ? "bg-cyan-600 text-white hover:bg-cyan-700 hover:text-white"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <Link href={item.href} onClick={() => setIsOpen(false)}>
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                </Button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
