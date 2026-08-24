import { AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type CommissionModifierBreakdownItem = {
  name: string;
  reward_mode: "BPS" | "FLAT_PAISE";
  delta_bps?: number;
  delta_paise?: number;
  passed: boolean;
};

export type CommissionTransparencyData = {
  base_rate_bps: number;
  effective_rate_bps: number;
  flat_bonus_total_paise: number;
  estimated_pool_paise: number;
  limited_data: boolean;
  limited_data_reason?: string;
  modifiers: CommissionModifierBreakdownItem[];
};

type CommissionTransparencyCardProps = {
  data: CommissionTransparencyData | null | undefined;
  isLoading?: boolean;
};

function formatPercentFromBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function formatInrFromPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN")}`;
}

function formatModifierDelta(item: CommissionModifierBreakdownItem): string {
  if (item.reward_mode === "FLAT_PAISE") {
    const delta = item.delta_paise ?? 0;
    const sign = delta >= 0 ? "+" : "-";
    return `${sign}${formatInrFromPaise(Math.abs(delta))}`;
  }

  const delta = item.delta_bps ?? 0;
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${formatPercentFromBps(Math.abs(delta))}`;
}

function modifierDeltaClass(item: CommissionModifierBreakdownItem): string {
  if (!item.passed) {
    return "text-slate-500";
  }

  const numericDelta =
    item.reward_mode === "FLAT_PAISE" ? (item.delta_paise ?? 0) : (item.delta_bps ?? 0);
  if (numericDelta < 0) {
    return "text-red-700";
  }

  return "text-emerald-700";
}

export function CommissionTransparencyCard({
  data,
  isLoading = false,
}: CommissionTransparencyCardProps) {
  if (isLoading) {
    return (
      <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-44" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Your Commission Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">
            No commission evaluations yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-900">Your Commission Rate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.limited_data ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-3.5" />
              Limited data window
            </p>
            <p className="mt-1">
              {data.limited_data_reason ?? "Some metrics were estimated from incomplete records."}
            </p>
          </div>
        ) : null}

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Base</p>
          <p className="text-2xl font-bold text-slate-900">
            Base: {formatPercentFromBps(data.base_rate_bps)}
          </p>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Modifier Breakdown
          </p>
          {data.modifiers.length === 0 ? (
            <p className="text-sm text-slate-500">No modifiers applied in the latest evaluation.</p>
          ) : (
            <div className="space-y-2">
              {data.modifiers.map((item) => (
                <div
                  key={`${item.name}-${item.reward_mode}`}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className={cn("text-sm font-semibold", modifierDeltaClass(item))}>
                      {formatModifierDelta(item)}
                    </p>
                    <Badge
                      className={
                        item.passed
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-700"
                      }
                    >
                      {item.passed ? "Passed" : "Failed"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1 rounded-lg bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-900">
            Effective: {formatPercentFromBps(data.effective_rate_bps)}
          </p>
          <p className="text-sm text-slate-600">
            +{formatInrFromPaise(Math.max(data.flat_bonus_total_paise, 0))} flat bonuses
          </p>
          <p className="text-sm text-slate-600">
            Est. pool: {formatInrFromPaise(data.estimated_pool_paise)} on last deal
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Info className="size-3.5" />
          Values reflect your latest commission evaluation snapshot.
        </div>
      </CardContent>
    </Card>
  );
}
