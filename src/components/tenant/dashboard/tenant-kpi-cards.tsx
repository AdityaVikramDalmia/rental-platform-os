"use client";

import Link from "next/link";
import { CalendarDays, FileText, MessageSquare, Star, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type TenantKpiSummary = {
  open_inquiries_count: number;
  upcoming_visits_count: number;
  favorites_count: number;
  unread_messages_count: number;
};

type TenantKpiCardsProps = {
  summary?: TenantKpiSummary;
};

type KpiCardConfig = {
  label: string;
  value: string;
  href: string;
  icon: LucideIcon;
};

export function TenantKpiCards({ summary }: TenantKpiCardsProps) {
  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {["one", "two", "three", "four"].map((key) => (
          <Card key={key} className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="size-8 rounded-lg" />
              </div>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards: KpiCardConfig[] = [
    {
      label: "Open Inquiries",
      value: summary.open_inquiries_count.toLocaleString("en-IN"),
      href: "/tenant/inquiries",
      icon: FileText,
    },
    {
      label: "Upcoming Visits",
      value: summary.upcoming_visits_count.toLocaleString("en-IN"),
      href: "/tenant/visits",
      icon: CalendarDays,
    },
    {
      label: "Saved Favorites",
      value: summary.favorites_count.toLocaleString("en-IN"),
      href: "/tenant/favorites",
      icon: Star,
    },
    {
      label: "Unread Messages",
      value: summary.unread_messages_count.toLocaleString("en-IN"),
      href: "/tenant/messages",
      icon: MessageSquare,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => (
        <Link key={card.label} href={card.href} className="block">
          <Card className="h-full border-slate-200 bg-white shadow-sm transition-all hover:border-cyan-200 hover:shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
                  {card.label}
                </CardTitle>
                <span className="inline-flex size-8 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700">
                  <card.icon className="size-4" />
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tracking-tight text-slate-900">{card.value}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
