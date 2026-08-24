"use client";

import Link from "next/link";
import { Building2, Headphones, MessageSquare, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

const QUICK_LINKS = [
  {
    href: "/owner/properties",
    label: "View Properties",
    icon: Building2,
  },
  {
    href: "/owner/earnings",
    label: "Track Earnings",
    icon: Wallet,
  },
  {
    href: "/owner/messages",
    label: "Messages",
    icon: MessageSquare,
  },
  {
    href: "/owner/service-requests",
    label: "Service Requests",
    icon: Headphones,
  },
] as const;

export function OwnerDashboardQuickLinks() {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-900">Quick Links</h2>
      <div className="grid grid-cols-2 gap-3">
        {QUICK_LINKS.map((link) => (
          <Button
            key={link.href}
            asChild
            variant="outline"
            className="h-20 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            <Link href={link.href} className="flex flex-col items-center justify-center gap-2">
              <link.icon className="size-4" />
              <span className="text-xs font-medium">{link.label}</span>
            </Link>
          </Button>
        ))}
      </div>
    </section>
  );
}
