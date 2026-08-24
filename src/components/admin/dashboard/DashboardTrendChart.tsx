"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { DashboardTimeWindow } from "./TimeWindowSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

type DashboardTrendChartProps = {
  timeWindow: DashboardTimeWindow;
};

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

function mapTimeWindowToDays(timeWindow: DashboardTimeWindow): number {
  if (timeWindow === "last_7_days") return 7;
  if (timeWindow === "last_30_days") return 30;
  if (timeWindow === "last_90_days") return 90;
  return 365;
}

function toAxisDateLabel(date: string): string {
  return DATE_LABEL_FORMATTER.format(new Date(`${date}T00:00:00.000Z`));
}

export function DashboardTrendChart({ timeWindow }: DashboardTrendChartProps) {
  const trendData = useQuery(api.analytics.getLeadTrend, {
    days: mapTimeWindowToDays(timeWindow),
  });

  const chartData = useMemo(() => {
    if (!trendData) {
      return [];
    }

    return trendData.map((item) => ({
      ...item,
      axis_date: toAxisDateLabel(item.date),
    }));
  }, [trendData]);

  if (trendData === undefined) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Lead Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900">Lead Trend</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-slate-500">
            No trend data for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="axis_date" tick={{ fill: "#64748b", fontSize: 12 }} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip
                labelFormatter={(value) => `Date: ${value}`}
                formatter={(value: unknown, seriesName: string | undefined) => {
                  const numeric = typeof value === "number" ? value : 0;
                  return [numeric.toLocaleString("en-IN"), seriesName ?? "Value"];
                }}
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
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
