"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import type { DashboardTimeWindow } from "./TimeWindowSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DashboardFunnelChartProps = {
  timeWindow: DashboardTimeWindow;
};

const STAGE_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  VERIFIED: "Verified",
  HAS_LISTING: "Listing",
  HAS_VISIT: "Visit",
  CLOSURE_CONFIRMED: "Closure",
  PAID: "Disbursed",
};

const STAGE_ORDER = [
  "SUBMITTED",
  "VERIFIED",
  "HAS_LISTING",
  "HAS_VISIT",
  "CLOSURE_CONFIRMED",
  "PAID",
] as const;

type Stage = (typeof STAGE_ORDER)[number];

type FunnelChartRow = {
  stage: Stage;
  stage_label: string;
  count: number;
  drop_off_pct: number | null;
  drop_off_label: string;
};

const STAGE_LINKS: Record<Stage, string> = {
  SUBMITTED: "/admin/leads?status=SUBMITTED",
  VERIFIED: "/admin/leads?status=VERIFIED",
  HAS_LISTING: "/admin/leads?status=VERIFIED",
  HAS_VISIT: "/admin/visits",
  CLOSURE_CONFIRMED: "/admin/closures",
  PAID: "/admin/payouts?status=disbursed",
};

type FunnelTooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload?: FunnelChartRow;
  }>;
};

function FunnelTooltipContent({ active, payload }: FunnelTooltipProps) {
  if (!active || !payload?.[0]?.payload) {
    return null;
  }

  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-900">
        {row.stage_label} - {row.count.toLocaleString("en-IN")} leads
      </p>
      <p className="mt-1 text-slate-600">Click to view</p>
    </div>
  );
}

function toStageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replaceAll("_", " ");
}

export function DashboardFunnelChart({ timeWindow }: DashboardFunnelChartProps) {
  const router = useRouter();
  const funnelData = useQuery(api.analytics.getLeadFunnel, { time_window: timeWindow });

  const chartData = useMemo(() => {
    if (!funnelData) {
      return [];
    }

    const rowsByStage = new Map(funnelData.map((item) => [item.stage, item]));
    return STAGE_ORDER.map((stage) => {
      const row = rowsByStage.get(stage);
      const count = row?.count ?? 0;
      const dropOff = row?.drop_off_pct ?? null;

      return {
        stage,
        stage_label: toStageLabel(stage),
        count,
        drop_off_pct: dropOff,
        drop_off_label: dropOff === null ? "" : `${dropOff}% dropped`,
      } satisfies FunnelChartRow;
    });
  }, [funnelData]);

  const handleBarClick = (_: unknown, index: number) => {
    const row = chartData[index];
    if (!row) {
      return;
    }

    router.push(STAGE_LINKS[row.stage]);
  };

  if (funnelData === undefined) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Lead Funnel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-[300px] w-full" />
          <div className="grid gap-2 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`funnel-dropoff-skeleton-${index}`} className="h-4 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData = chartData.some((item) => item.count > 0);

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900">Lead Funnel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasData ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-slate-500">
            No lead data for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 80, left: 4, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="stage_label"
                width={100}
                tick={{ fill: "#334155", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(148,163,184,0.12)" }}
                content={<FunnelTooltipContent />}
              />
              <Bar
                dataKey="count"
                fill="#0f172a"
                radius={[0, 6, 6, 0]}
                cursor="pointer"
                activeBar={{ fill: "#6366f1" }}
                onClick={handleBarClick}
              >
                <LabelList dataKey="drop_off_label" position="right" fill="#64748b" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {hasData ? (
          <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-2">
            {chartData.slice(1).map((item) => (
              <p key={`dropoff-${item.stage}`}>
                {toStageLabel(
                  STAGE_ORDER[STAGE_ORDER.indexOf(item.stage as (typeof STAGE_ORDER)[number]) - 1],
                )}
                {" -> "}
                {item.stage_label}
                {": "}
                {item.drop_off_pct === null ? "No prior stage" : `${item.drop_off_pct}% dropped`}
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
