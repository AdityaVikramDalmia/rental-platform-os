"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { api } from "../../../../../../convex/_generated/api";
import type { TimeWindow } from "../page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type OperationalTabProps = {
  timeWindow: TimeWindow;
};

type TrendDirection = "up" | "down" | "flat" | null;

type MetricCard = {
  key:
    | "avg_submitted_to_verified_days"
    | "avg_verified_to_listing_days"
    | "avg_listing_to_first_visit_days"
    | "avg_verified_to_closure_days"
    | "need_info_rate"
    | "duplicate_rate"
    | "visit_no_show_rate";
  label: string;
  value: number | null;
  trend: TrendDirection;
  isRate?: boolean;
};

function getTrendUi(trend: TrendDirection): {
  icon: typeof TrendingDown | typeof TrendingUp | typeof Minus;
  label: string;
  className: string;
} {
  if (trend === "down") {
    return { icon: TrendingDown, label: "Improving", className: "text-green-600" };
  }

  if (trend === "up") {
    return { icon: TrendingUp, label: "Worsening", className: "text-red-600" };
  }

  return { icon: Minus, label: "Stable", className: "text-slate-500" };
}

function formatValue(value: number | null, isRate: boolean): string {
  if (value === null) {
    return "No data";
  }

  return isRate ? `${value.toFixed(1)}%` : `${value.toFixed(1)} days`;
}

export function OperationalTab({ timeWindow }: OperationalTabProps) {
  const [societySearch, setSocietySearch] = useState("");
  const [selectedSocietyId, setSelectedSocietyId] = useState<Id<"societies"> | null>(null);

  const societies = useQuery(api.analytics.getSocietyComparison, { time_window: "all_time" });

  const metricsArgs = useMemo(() => {
    const args: {
      time_window: TimeWindow;
      society_id?: Id<"societies">;
    } = {
      time_window: timeWindow,
    };

    if (selectedSocietyId) {
      args.society_id = selectedSocietyId;
    }

    return args;
  }, [selectedSocietyId, timeWindow]);

  const metrics = useQuery(api.analytics.getOperationalMetrics, metricsArgs);

  const filteredSocieties = useMemo(() => {
    if (!societies) {
      return [];
    }

    const normalized = societySearch.trim().toLowerCase();
    if (!normalized) {
      return societies;
    }

    return societies.filter((society) => {
      const haystack = `${society.society_name} ${society.city}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [societies, societySearch]);

  if (metrics === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-7 animate-spin text-slate-500" />
      </div>
    );
  }

  const cards: MetricCard[] = [
    {
      key: "avg_submitted_to_verified_days",
      label: "Avg time: Submitted to Verified",
      value: metrics.avg_submitted_to_verified_days.value,
      trend: metrics.avg_submitted_to_verified_days.trend,
    },
    {
      key: "avg_verified_to_listing_days",
      label: "Avg time: Verified to Listing",
      value: metrics.avg_verified_to_listing_days.value,
      trend: metrics.avg_verified_to_listing_days.trend,
    },
    {
      key: "avg_listing_to_first_visit_days",
      label: "Avg time: Listing to First Visit",
      value: metrics.avg_listing_to_first_visit_days.value,
      trend: metrics.avg_listing_to_first_visit_days.trend,
    },
    {
      key: "avg_verified_to_closure_days",
      label: "Avg time: Verified to Closure",
      value: metrics.avg_verified_to_closure_days.value,
      trend: metrics.avg_verified_to_closure_days.trend,
    },
    {
      key: "need_info_rate",
      label: "NEED_INFO rate",
      value: metrics.need_info_rate.value,
      trend: metrics.need_info_rate.trend,
      isRate: true,
    },
    {
      key: "duplicate_rate",
      label: "Duplicate rate",
      value: metrics.duplicate_rate.value,
      trend: metrics.duplicate_rate.trend,
      isRate: true,
    },
    {
      key: "visit_no_show_rate",
      label: "Visit No-Show rate",
      value: metrics.visit_no_show_rate.value,
      trend: metrics.visit_no_show_rate.trend,
      isRate: true,
    },
  ];

  const allNull = cards.every((card) => card.value === null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <Input
          value={societySearch}
          onChange={(event) => setSocietySearch(event.target.value)}
          placeholder="Search society"
          className="h-9 w-[220px]"
        />
        <Select
          value={selectedSocietyId ?? "__all__"}
          onValueChange={(value) =>
            setSelectedSocietyId(value === "__all__" ? null : (value as Id<"societies">))
          }
        >
          <SelectTrigger className="h-9 w-[260px]">
            <SelectValue placeholder="All societies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All societies</SelectItem>
            {filteredSocieties.map((society) => (
              <SelectItem key={society.society_id} value={society.society_id}>
                {society.society_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {allNull ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="py-16 text-center text-sm text-slate-500">
            No operational data available for this period.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {cards.map((card) => {
            const trendUi = getTrendUi(card.trend);
            const TrendIcon = trendUi.icon;

            return (
              <Card key={card.key} className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">{card.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p
                    className={cn(
                      "text-2xl font-semibold tracking-tight",
                      card.value === null ? "text-slate-500" : "text-slate-900",
                    )}
                  >
                    {formatValue(card.value, Boolean(card.isRate))}
                  </p>
                  <div className={cn("inline-flex items-center gap-1 text-xs", trendUi.className)}>
                    <TrendIcon className="size-3.5" />
                    {trendUi.label}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
