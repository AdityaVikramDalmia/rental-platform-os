"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
  ClipboardCheck,
  FileText,
  HeartHandshake,
  MapPin,
  Star,
  type LucideIcon,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Trend = {
  icon: typeof ArrowUpRight | typeof ArrowDownRight | typeof ArrowRight;
  className: string;
  text: string;
};

type SummaryCard = {
  key: string;
  label: string;
  value: string;
  icon: LucideIcon;
  href: string;
  trend: Trend;
  valueClassName?: string;
};

function getQualityPresentation(score: number | null): {
  value: string;
  valueClassName: string;
  trend: Trend;
} {
  if (score === null) {
    return {
      value: "N/A",
      valueClassName: "text-slate-500",
      trend: {
        icon: ArrowRight,
        className: "text-slate-500",
        text: "No quality score data",
      },
    };
  }

  if (score > 70) {
    return {
      value: score.toFixed(1),
      valueClassName: "text-green-600",
      trend: {
        icon: ArrowUpRight,
        className: "text-green-600",
        text: "Healthy team quality",
      },
    };
  }

  if (score > 50) {
    return {
      value: score.toFixed(1),
      valueClassName: "text-amber-600",
      trend: {
        icon: ArrowRight,
        className: "text-amber-600",
        text: "Quality needs monitoring",
      },
    };
  }

  return {
    value: score.toFixed(1),
    valueClassName: "text-red-600",
    trend: {
      icon: ArrowDownRight,
      className: "text-red-600",
      text: "Quality below threshold",
    },
  };
}

function getCompliancePresentation(compliancePct: number | null): {
  value: string;
  valueClassName: string;
  trend: Trend;
} {
  if (compliancePct === null) {
    return {
      value: "N/A",
      valueClassName: "text-slate-500",
      trend: {
        icon: ArrowRight,
        className: "text-slate-500",
        text: "No check-in data",
      },
    };
  }

  if (compliancePct > 80) {
    return {
      value: `${compliancePct.toFixed(1)}%`,
      valueClassName: "text-green-600",
      trend: {
        icon: ArrowUpRight,
        className: "text-green-600",
        text: "Review cadence is healthy",
      },
    };
  }

  if (compliancePct > 60) {
    return {
      value: `${compliancePct.toFixed(1)}%`,
      valueClassName: "text-amber-600",
      trend: {
        icon: ArrowRight,
        className: "text-amber-600",
        text: "Review cadence at risk",
      },
    };
  }

  return {
    value: `${compliancePct.toFixed(1)}%`,
    valueClassName: "text-red-600",
    trend: {
      icon: ArrowDownRight,
      className: "text-red-600",
      text: "Review cadence is poor",
    },
  };
}

export function SummaryCards() {
  const overview = useQuery(api.opsManagement.getCommandCenterOverview);

  const cards = useMemo<SummaryCard[]>(() => {
    if (!overview) {
      return [];
    }

    const quality = getQualityPresentation(overview.team_quality_avg);
    const compliance = getCompliancePresentation(overview.review_compliance_pct);

    return [
      {
        key: "active_leads",
        label: "Active Leads",
        value: overview.active_leads.toLocaleString("en-IN"),
        icon: FileText,
        href: "/admin/leads",
        trend: {
          icon: ArrowRight,
          className: "text-slate-500",
          text: "Open in lead pipeline",
        },
      },
      {
        key: "pending_visits",
        label: "Pending Visits",
        value: overview.pending_visits.toLocaleString("en-IN"),
        icon: MapPin,
        href: "/admin/visits",
        trend: {
          icon: ArrowRight,
          className: "text-slate-500",
          text: "Visits awaiting execution",
        },
      },
      {
        key: "active_negotiations",
        label: "Active Negotiations",
        value: overview.active_negotiations.toLocaleString("en-IN"),
        icon: HeartHandshake,
        href: "/admin/negotiations",
        trend: {
          icon: ArrowRight,
          className: "text-slate-500",
          text: `${overview.active_warning_count.toLocaleString("en-IN")} active warnings`,
        },
      },
      {
        key: "recent_closures_30d",
        label: "Closures (30d)",
        value: overview.recent_closures_30d.toLocaleString("en-IN"),
        icon: CheckCircle,
        href: "/admin/closures",
        trend: {
          icon: ArrowRight,
          className: "text-slate-500",
          text: "Confirmed in last 30 days",
        },
      },
      {
        key: "team_quality_avg",
        label: "Team Quality",
        value: quality.value,
        valueClassName: quality.valueClassName,
        icon: Star,
        href: "/admin/ops-command-center?view=ops_head",
        trend: quality.trend,
      },
      {
        key: "review_compliance_pct",
        label: "Review Compliance",
        value: compliance.value,
        valueClassName: compliance.valueClassName,
        icon: ClipboardCheck,
        href: "/admin/ops-command-center?view=ops_head",
        trend: {
          ...compliance.trend,
          text: `${compliance.trend.text} • ${overview.active_ops_count.toLocaleString("en-IN")} active OPS`,
        },
      },
    ];
  }, [overview]);

  if (overview === undefined) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_value, index) => (
          <Card
            key={`summary-skeleton-${index + 1}`}
            className="border-slate-200 bg-white shadow-sm"
          >
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="size-9 rounded-lg" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const TrendIcon = card.trend.icon;

        return (
          <Link key={card.key} href={card.href} className="block">
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
                </div>
                <span className="inline-flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <card.icon className="size-4" />
                </span>
              </CardHeader>
              <CardContent className="space-y-3">
                <p
                  className={cn(
                    "text-2xl font-semibold tracking-tight text-slate-900",
                    card.valueClassName,
                  )}
                >
                  {card.value}
                </p>
                <div
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium leading-tight",
                    card.trend.className,
                  )}
                >
                  <TrendIcon className="size-3.5 shrink-0" />
                  <span>{card.trend.text}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
