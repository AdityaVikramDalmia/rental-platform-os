"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { api } from "../../../../../../convex/_generated/api";
import type { TimeWindow } from "../page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type LeadFunnelChartProps = {
  timeWindow: TimeWindow;
  societyId?: Id<"societies">;
};

function toStageLabel(stage: string): string {
  if (stage === "SUBMITTED") return "Submitted";
  if (stage === "VERIFIED") return "Verified";
  if (stage === "HAS_LISTING") return "Listing";
  if (stage === "HAS_VISIT") return "Visit";
  if (stage === "CLOSURE_CONFIRMED") return "Closure";
  if (stage === "PAID") return "Paid";
  return stage.replaceAll("_", " ");
}

export function LeadFunnelChart({ timeWindow, societyId }: LeadFunnelChartProps) {
  const funnelData = useQuery(
    api.analytics.getLeadFunnel,
    societyId ? { time_window: timeWindow, society_id: societyId } : { time_window: timeWindow },
  );

  const chartData = useMemo(() => {
    if (!funnelData) {
      return [];
    }

    return funnelData.map((item) => ({
      ...item,
      stage_label: toStageLabel(item.stage),
      drop_off_label: item.drop_off_pct === null ? "" : `Drop ${item.drop_off_pct}%`,
    }));
  }, [funnelData]);

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900">Lead Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        {funnelData === undefined ? (
          <div className="flex h-[320px] items-center justify-center">
            <Loader2 className="size-6 animate-spin text-slate-500" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
            No funnel data available for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 80, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" allowDecimals={false} stroke="#64748b" fontSize={12} />
              <YAxis
                type="category"
                dataKey="stage_label"
                width={92}
                tick={{ fill: "#334155", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                formatter={(value: unknown) => {
                  const numeric = typeof value === "number" ? value : 0;
                  return [numeric.toLocaleString("en-IN"), "Count"];
                }}
                labelFormatter={(_, payload) => {
                  const item = payload?.[0]?.payload as
                    | { stage_label?: string; drop_off_pct?: number | null }
                    | undefined;

                  if (!item) {
                    return "";
                  }

                  return item.drop_off_pct === null || item.drop_off_pct === undefined
                    ? (item.stage_label ?? "")
                    : `${item.stage_label} (drop-off ${item.drop_off_pct}%)`;
                }}
              />
              <Bar dataKey="count" fill="#0f172a" radius={[0, 6, 6, 0]}>
                <LabelList dataKey="drop_off_label" position="right" fill="#64748b" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
