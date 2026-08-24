"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { api } from "../../../../../../convex/_generated/api";
import type { TimeWindow } from "../page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TrendLineChartProps = {
  timeWindow: TimeWindow;
  societyId?: Id<"societies">;
  title?: string;
};

function mapTimeWindowToDays(timeWindow: TimeWindow): number {
  if (timeWindow === "last_7_days") return 7;
  if (timeWindow === "last_30_days") return 30;
  if (timeWindow === "last_90_days") return 90;
  return 365;
}

function toAxisDateLabel(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

export function TrendLineChart({
  timeWindow,
  societyId,
  title = "Daily Lead Trend",
}: TrendLineChartProps) {
  const trendData = useQuery(
    api.analytics.getLeadTrend,
    societyId
      ? { days: mapTimeWindowToDays(timeWindow), society_id: societyId }
      : { days: mapTimeWindowToDays(timeWindow) },
  );

  const chartData = useMemo(() => {
    if (!trendData) {
      return [];
    }

    return trendData.map((item) => ({
      ...item,
      axis_date: toAxisDateLabel(item.date),
    }));
  }, [trendData]);

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {trendData === undefined ? (
          <div className="flex h-[320px] items-center justify-center">
            <Loader2 className="size-6 animate-spin text-slate-500" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
            No trend data available for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="axis_date" tick={{ fill: "#64748b", fontSize: 12 }} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip
                formatter={(value: unknown, name: string | undefined) => {
                  let numeric = 0;
                  if (typeof value === "number") {
                    numeric = value;
                  } else if (Array.isArray(value) && typeof value[0] === "number") {
                    numeric = value[0];
                  }

                  return [numeric.toLocaleString("en-IN"), name ?? "Value"];
                }}
                labelFormatter={(value) => `Date: ${value}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="submitted"
                name="Submitted"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="verified"
                name="Verified"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="closures"
                name="Closures"
                stroke="#ea580c"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
