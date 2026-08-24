"use client";

import Link from "next/link";
import { AlertCircle, Building2, IndianRupee, Users, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type OwnerDashboardKpisData = {
  total_properties: number;
  active_tenants: number;
  expected_monthly_rent: number;
  pending_requests: number;
};

type OwnerDashboardKpisProps = {
  kpis?: OwnerDashboardKpisData;
};

type KpiCardConfig = {
  label: string;
  value: string;
  href: string;
  icon: LucideIcon;
};

function renderSkeletonCards() {
  const skeletonKeys = ["properties", "tenants", "rent", "requests"] as const;

  return (
    <div className="grid grid-cols-2 gap-3">
      {skeletonKeys.map((key) => (
        <Card key={key} className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-7 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function OwnerDashboardKpis({ kpis }: OwnerDashboardKpisProps) {
  if (!kpis) {
    return renderSkeletonCards();
  }

  const cards: KpiCardConfig[] = [
    {
      label: "Properties",
      value: kpis.total_properties.toLocaleString("en-IN"),
      href: "/owner/properties",
      icon: Building2,
    },
    {
      label: "Active Tenants",
      value: kpis.active_tenants.toLocaleString("en-IN"),
      href: "/owner/properties",
      icon: Users,
    },
    {
      label: "Monthly Rent",
      value: (kpis.expected_monthly_rent / 100).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }),
      href: "/owner/earnings",
      icon: IndianRupee,
    },
    {
      label: "Pending Requests",
      value: kpis.pending_requests.toLocaleString("en-IN"),
      href: "/owner/service-requests",
      icon: AlertCircle,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => (
        <Link key={card.label} href={card.href} className="block">
          <Card className="h-full border-slate-200 bg-white shadow-sm transition-all hover:border-indigo-200 hover:shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
                  {card.label}
                </CardTitle>
                <span className="inline-flex size-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
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
