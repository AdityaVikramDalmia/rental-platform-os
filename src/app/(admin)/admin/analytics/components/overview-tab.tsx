"use client";

import { useQuery } from "convex/react";
import {
  Building2,
  CircleCheckBig,
  HandCoins,
  Landmark,
  Loader2,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { formatINR } from "../../../../../../lib/money";
import type { PersonaFilter, TimeWindow } from "../page";
import { KpiCard } from "./kpi-card";
import { LeadFunnelChart } from "./lead-funnel-chart";
import { TrendLineChart } from "./trend-line-chart";

type OverviewTabProps = {
  timeWindow: TimeWindow;
  personaFilter: PersonaFilter;
};

function formatPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${value.toFixed(1)}%`;
}

function formatWindowLabel(timeWindow: TimeWindow): string {
  if (timeWindow === "last_7_days") return "Last 7 days";
  if (timeWindow === "last_30_days") return "Last 30 days";
  if (timeWindow === "last_90_days") return "Last 90 days";
  return "All time";
}

export function OverviewTab({ timeWindow, personaFilter }: OverviewTabProps) {
  const kpis = useQuery(api.analytics.getOverviewKPIs, {
    time_window: timeWindow,
    persona_filter: personaFilter,
  });
  const windowLabel = formatWindowLabel(timeWindow);
  const activeFieldWorkerLabel =
    personaFilter === "OPS"
      ? "Active OPS"
      : personaFilter === "ALL"
        ? "Active Field Workers"
        : "Active Guards";

  if (kpis === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-7 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={ShieldCheck}
          label="Total Leads"
          value={kpis.total_leads.toLocaleString("en-IN")}
          subLabel={windowLabel}
        />
        <KpiCard
          icon={CircleCheckBig}
          label="Verified Rate"
          value={formatPercent(kpis.verified_rate)}
          subLabel={windowLabel}
          trendColorInverted
        />
        <KpiCard
          icon={UserCheck}
          label={activeFieldWorkerLabel}
          value={kpis.active_field_workers.toLocaleString("en-IN")}
          subLabel={windowLabel}
        />
        <KpiCard
          icon={Building2}
          label="Active Societies"
          value={kpis.active_societies.toLocaleString("en-IN")}
          subLabel={windowLabel}
        />
        <KpiCard
          icon={HandCoins}
          label="Pending Payouts"
          value={kpis.pending_payouts === null ? "—" : formatINR(kpis.pending_payouts)}
          subLabel={windowLabel}
        />
        <KpiCard
          icon={Landmark}
          label="Total Paid Out"
          value={kpis.total_paid_out === null ? "—" : formatINR(kpis.total_paid_out)}
          subLabel={windowLabel}
        />
        <KpiCard
          icon={CircleCheckBig}
          label="Conversion Rate"
          value={formatPercent(kpis.conversion_rate)}
          subLabel={windowLabel}
          trendColorInverted
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <LeadFunnelChart timeWindow={timeWindow} />
        <TrendLineChart timeWindow={timeWindow} />
      </div>
    </div>
  );
}
