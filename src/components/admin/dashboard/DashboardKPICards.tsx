"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CircleCheckBig,
  HandCoins,
  Landmark,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { DashboardTimeWindow } from "./TimeWindowSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type PersonaFilter = "GUARD" | "OPS" | "ALL";

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

type KpiKey =
  | "total_leads"
  | "verified_rate"
  | "active_field_workers"
  | "active_societies"
  | "pending_payouts"
  | "total_paid_out"
  | "conversion_rate";

type KpiKind = "count" | "percent" | "currency";

type KpiConfig = {
  key: KpiKey;
  label: string;
  icon: LucideIcon;
  kind: KpiKind;
};

type TrendData = {
  icon: typeof ArrowUpRight | typeof ArrowDownRight | typeof ArrowRight;
  className: string;
  text: string;
};

function getKpiConfigs(personaFilter: PersonaFilter): KpiConfig[] {
  const fieldWorkerLabel =
    personaFilter === "OPS"
      ? "Active OPS"
      : personaFilter === "ALL"
        ? "Active Field Workers"
        : "Active Guards";

  return [
    { key: "total_leads", label: "Total Leads", icon: ShieldCheck, kind: "count" },
    { key: "verified_rate", label: "Verified Rate", icon: CircleCheckBig, kind: "percent" },
    { key: "active_field_workers", label: fieldWorkerLabel, icon: Users, kind: "count" },
    { key: "active_societies", label: "Active Societies", icon: Users, kind: "count" },
    { key: "pending_payouts", label: "Pending Payouts", icon: HandCoins, kind: "currency" },
    { key: "total_paid_out", label: "Total Paid Out", icon: Landmark, kind: "currency" },
    { key: "conversion_rate", label: "Conversion Rate", icon: CircleCheckBig, kind: "percent" },
  ];
}

const KPI_LINKS: Record<KpiKey, string> = {
  total_leads: "/admin/leads",
  verified_rate: "/admin/leads?status=VERIFIED",
  active_field_workers: "/admin/guards?status=ACTIVE",
  active_societies: "/admin/societies?status=ACTIVE",
  pending_payouts: "/admin/payouts?status=pending",
  total_paid_out: "/admin/payouts?status=disbursed",
  conversion_rate: "/admin/leads",
};

const KPI_SKELETON_KEYS = [
  "total_leads",
  "verified_rate",
  "active_field_workers",
  "active_societies",
  "pending_payouts",
  "total_paid_out",
  "conversion_rate",
] as const;

function formatWindowLabel(timeWindow: DashboardTimeWindow): string {
  if (timeWindow === "last_7_days") return "Last 7 days";
  if (timeWindow === "last_30_days") return "Last 30 days";
  if (timeWindow === "last_90_days") return "Last 90 days";
  return "All time";
}

function getComparisonWindow(timeWindow: DashboardTimeWindow): DashboardTimeWindow | null {
  if (timeWindow === "last_7_days") return "last_30_days";
  if (timeWindow === "last_30_days") return "last_90_days";
  if (timeWindow === "last_90_days") return "all_time";
  return null;
}

function formatValue(value: number | null, kind: KpiKind): string {
  if (value === null) {
    return "—";
  }

  if (kind === "currency") {
    return INR_FORMATTER.format(value / 100);
  }

  if (kind === "percent") {
    return `${value.toFixed(1)}%`;
  }

  return value.toLocaleString("en-IN");
}

function formatDelta(delta: number, kind: KpiKind): string {
  if (kind === "currency") {
    return INR_FORMATTER.format(Math.abs(delta) / 100);
  }

  if (kind === "percent") {
    return `${Math.abs(delta).toFixed(1)}pp`;
  }

  return Math.abs(Math.round(delta)).toLocaleString("en-IN");
}

function getTrendData(
  currentValue: number | null,
  previousValue: number | null | undefined,
  kind: KpiKind,
  comparisonLabel: string,
): TrendData | null {
  if (currentValue === null || previousValue === null || previousValue === undefined) {
    return null;
  }

  const delta = currentValue - previousValue;
  if (Math.abs(delta) < 0.001) {
    return {
      icon: ArrowRight,
      className: "text-slate-500",
      text: `No change vs ${comparisonLabel}`,
    };
  }

  if (delta > 0) {
    return {
      icon: ArrowUpRight,
      className: "text-green-600",
      text: `+${formatDelta(delta, kind)} vs ${comparisonLabel}`,
    };
  }

  return {
    icon: ArrowDownRight,
    className: "text-red-600",
    text: `-${formatDelta(delta, kind)} vs ${comparisonLabel}`,
  };
}

type DashboardKPICardsProps = {
  timeWindow: DashboardTimeWindow;
};

export function DashboardKPICards({ timeWindow }: DashboardKPICardsProps) {
  const [personaFilter, setPersonaFilter] = useState<PersonaFilter>("GUARD");
  const kpis = useQuery(api.analytics.getOverviewKPIs, {
    time_window: timeWindow,
    persona_filter: personaFilter,
  });
  const comparisonWindow = getComparisonWindow(timeWindow);
  const previousWindowKpis = useQuery(
    api.analytics.getOverviewKPIs,
    comparisonWindow
      ? {
          time_window: comparisonWindow,
          persona_filter: personaFilter,
        }
      : "skip",
  );

  const windowLabel = formatWindowLabel(timeWindow);
  const comparisonLabel = comparisonWindow ? formatWindowLabel(comparisonWindow) : "";

  const cards = useMemo(() => {
    if (!kpis) {
      return [];
    }

    return getKpiConfigs(personaFilter).map((config) => {
      const currentValue = kpis[config.key];
      const previousValue = previousWindowKpis?.[config.key];

      return {
        ...config,
        value: formatValue(currentValue, config.kind),
        trend: getTrendData(currentValue, previousValue, config.kind, comparisonLabel),
        breakdown:
          config.key === "active_field_workers"
            ? `Guards: ${kpis.active_guards.toLocaleString("en-IN")} | OPS: ${kpis.active_ops.toLocaleString("en-IN")}`
            : null,
      };
    });
  }, [comparisonLabel, kpis, personaFilter, previousWindowKpis]);

  if (kpis === undefined) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {KPI_SKELETON_KEYS.map((skeletonKey) => (
          <Card key={skeletonKey} className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="space-y-2 pb-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Select
          value={personaFilter}
          onValueChange={(value) => setPersonaFilter(value as PersonaFilter)}
        >
          <SelectTrigger className="h-9 w-[190px] bg-white">
            <SelectValue placeholder="Persona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GUARD">Guards</SelectItem>
            <SelectItem value="OPS">OPS</SelectItem>
            <SelectItem value="ALL">All field workers</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {personaFilter === "ALL" ? (
        <p className="text-xs text-slate-500">Mixed cohort view combines GUARD and OPS counts.</p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const TrendIcon = card.trend?.icon;

          return (
            <Link
              key={card.key}
              href={
                card.key === "active_field_workers"
                  ? `/admin/guards?status=ACTIVE&persona_filter=${personaFilter}`
                  : KPI_LINKS[card.key]
              }
              className="block"
            >
              <Card
                className={cn(
                  "border-slate-200 bg-white shadow-sm",
                  "cursor-pointer transition-all duration-150 hover:scale-[1.02] hover:shadow-md",
                )}
              >
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                      {card.label}
                    </CardTitle>
                    <p className="mt-1 text-xs text-slate-500">{windowLabel}</p>
                  </div>
                  <span className="inline-flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <card.icon className="size-4" />
                  </span>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl font-semibold tracking-tight text-slate-900">
                    {card.value}
                  </p>
                  {card.breakdown ? (
                    <p className="text-xs text-slate-500">{card.breakdown}</p>
                  ) : null}
                  {card.trend && TrendIcon ? (
                    <div
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-medium",
                        card.trend.className,
                      )}
                    >
                      <TrendIcon className="size-3.5" />
                      <span>{card.trend.text}</span>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
