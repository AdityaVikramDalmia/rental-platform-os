"use client";

import { useQuery } from "convex/react";
import { CircleDollarSign, TrendingUp } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STAGE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  DISCOVERY: { bg: "bg-sky-100", text: "text-sky-700", label: "Discovery" },
  VERIFICATION: { bg: "bg-amber-100", text: "text-amber-700", label: "Verification" },
  CLOSURE: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Closure" },
  SUPPORT: { bg: "bg-violet-100", text: "text-violet-700", label: "Support" },
};

function formatInr(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN")}`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function truncateId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function LoadingSkeleton() {
  return (
    <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <Skeleton className="h-6 w-52" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-3">
          <Skeleton className="h-16 w-1/2 rounded-lg" />
          <Skeleton className="h-16 w-1/2 rounded-lg" />
        </div>
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

export function AttributionEarningsCard() {
  const splits = useQuery(api.attribution.getMyEarnings, {});

  if (splits === undefined) {
    return <LoadingSkeleton />;
  }

  const totalPaise = splits.reduce((sum, s) => sum + s.amount_paise, 0);
  const uniqueClosures = new Set(splits.map((s) => String(s.closure_id)));
  const dealCount = uniqueClosures.size;

  if (splits.length === 0) {
    return (
      <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <CircleDollarSign className="size-4.5 text-slate-500" />
            Attribution Earnings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">
            No attribution earnings yet — earnings appear when deals you contributed to are closed.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-slate-900">
          <CircleDollarSign className="size-4.5 text-emerald-600" />
          Attribution Earnings
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-emerald-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">
              Total Earned
            </p>
            <p className="mt-0.5 text-2xl font-bold text-slate-900">{formatInr(totalPaise)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Deals</p>
            <p className="mt-0.5 text-2xl font-bold text-slate-900">{dealCount}</p>
          </div>
        </div>

        <div className="space-y-2">
          {splits.map((split) => {
            const stage = split.primary_stage ?? "DISCOVERY";
            const style = STAGE_STYLE[stage] ?? STAGE_STYLE.DISCOVERY;
            const sharePct = (split.share_bps / 100).toFixed(1);

            return (
              <div
                key={String(split._id)}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge className={`${style.bg} ${style.text} text-[11px]`}>{style.label}</Badge>
                    <span className="truncate text-xs text-slate-400">
                      {truncateId(String(split.closure_id))}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{formatDate(split.created_at)}</p>
                </div>

                <div className="flex flex-col items-end gap-0.5 text-right">
                  <p className="text-sm font-semibold text-slate-900">
                    {formatInr(split.amount_paise)}
                  </p>
                  <p className="flex items-center gap-0.5 text-xs text-slate-500">
                    <TrendingUp className="size-3" />
                    {sharePct}%
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
