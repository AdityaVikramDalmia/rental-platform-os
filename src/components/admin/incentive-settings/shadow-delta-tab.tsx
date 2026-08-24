"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────

type TimeWindow = "7d" | "30d" | "90d" | "all";
type EntityTypeFilter = "all" | "commission" | "attribution" | "disbursement";
type PersonaFilter = "all" | "GUARD" | "OPS" | "SALES" | "RM" | "LIAISON";

interface ShadowDelta {
  _id: string;
  entity_type: string;
  persona?: string;
  deal_id: string;
  v2_result_json: string;
  v3_result_json: string;
  delta_summary: string;
  config_version_id?: string;
  created_at: number;
}

// ─── Constants ───────────────────────────────────────────────────────

const TIME_WINDOWS: { value: TimeWindow; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const ENTITY_TYPES: { value: EntityTypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "commission", label: "Commission" },
  { value: "attribution", label: "Attribution" },
  { value: "disbursement", label: "Disbursement" },
];

const PERSONAS: { value: PersonaFilter; label: string }[] = [
  { value: "all", label: "All personas" },
  { value: "GUARD", label: "Guard" },
  { value: "OPS", label: "OPS" },
  { value: "SALES", label: "Sales" },
  { value: "RM", label: "RM" },
  { value: "LIAISON", label: "Liaison" },
];

const DAY_MS = 86_400_000;

const ENTITY_BADGE_CLASS: Record<string, string> = {
  commission: "border-blue-200 bg-blue-50 text-blue-700",
  attribution: "border-violet-200 bg-violet-50 text-violet-700",
  disbursement: "border-amber-200 bg-amber-50 text-amber-700",
};

// ─── Helpers ─────────────────────────────────────────────────────────

function windowToDates(window: TimeWindow): {
  from_date: number | undefined;
  to_date: number | undefined;
} {
  if (window === "all") return { from_date: undefined, to_date: undefined };
  const now = Date.now();
  const days = window === "7d" ? 7 : window === "30d" ? 30 : 90;
  return { from_date: now - days * DAY_MS, to_date: now };
}

function fmtINR(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtPct(value: number | null | undefined): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return "\u2014";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function fmtDelta(paise: number | null | undefined): string {
  if (paise === undefined || paise === null || !Number.isFinite(paise)) return "\u2014";
  if (paise === 0) return fmtINR(0);
  const sign = paise > 0 ? "+" : "-";
  return `${sign}${fmtINR(Math.abs(paise))}`;
}

function extractAmount(json: string): number | null {
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    if (typeof obj !== "object" || obj === null) return null;
    for (const key of [
      "total_paise",
      "amount_paise",
      "pool_paise",
      "payout_paise",
      "commission_pool_paise",
      "incentive_pool_paise",
    ]) {
      const val = obj[key];
      if (typeof val === "number" && Number.isFinite(val)) return val;
    }
    return null;
  } catch {
    return null;
  }
}

function extractDelta(summary: string): { deltaPaise: number; deltaPct: number | null } | null {
  try {
    const obj = JSON.parse(summary) as Record<string, unknown>;
    if (typeof obj !== "object" || obj === null) return null;
    const d = obj.absolute_delta_paise;
    if (typeof d !== "number" || !Number.isFinite(d)) return null;
    const pct =
      typeof obj.percentage_delta === "number" && Number.isFinite(obj.percentage_delta)
        ? (obj.percentage_delta as number)
        : null;
    return { deltaPaise: d, deltaPct: pct };
  } catch {
    return null;
  }
}

function deltaColor(value: number | null | undefined): string {
  if (value === undefined || value === null || value === 0) return "text-slate-900";
  return value > 0 ? "text-emerald-700" : "text-red-700";
}

function truncateId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 6)}\u2026${id.slice(-4)}`;
}

// ─── Stat Card ───────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("text-lg font-semibold", colorClass ?? "text-slate-900")}>{value}</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function ShadowDeltaTab() {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("30d");
  const [entityType, setEntityType] = useState<EntityTypeFilter>("all");
  const [persona, setPersona] = useState<PersonaFilter>("all");

  const dateRange = useMemo(() => windowToDates(timeWindow), [timeWindow]);

  const entityTypeArg = entityType === "all" ? undefined : entityType;
  const personaArg = persona === "all" ? undefined : persona;

  const aggregate = useQuery(api.shadowMode.getAggregateVariance, {
    entity_type: entityTypeArg,
    persona: personaArg,
    from_date: dateRange.from_date,
    to_date: dateRange.to_date,
  });

  const deltasResult = useQuery(api.shadowMode.listDeltas, {
    entity_type: entityTypeArg,
    persona: personaArg,
    from_date: dateRange.from_date,
    to_date: dateRange.to_date,
    limit: 50,
  });

  const deltas = deltasResult?.deltas ?? [];
  const totalCount = deltasResult?.total_count ?? 0;

  return (
    <div className="space-y-5">
      {/* ── Filter Bar ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={timeWindow} onValueChange={(v) => setTimeWindow(v as TimeWindow)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_WINDOWS.map((tw) => (
              <SelectItem key={tw.value} value={tw.value}>
                {tw.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityTypeFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((et) => (
              <SelectItem key={et.value} value={et.value}>
                {et.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={persona} onValueChange={(v) => setPersona(v as PersonaFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERSONAS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Aggregate Variance ──────────────────────────── */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Aggregate Variance</CardTitle>
          <CardDescription>Summary of v2 vs v3 delta across shadow mode runs.</CardDescription>
        </CardHeader>
        <CardContent>
          {aggregate === undefined ? (
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={`agg-skel-${String(i)}`} className="h-[72px] rounded-lg" />
              ))}
            </div>
          ) : aggregate.count === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
              No shadow deltas recorded for the selected filters.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="Count" value={String(aggregate.count)} />
              <StatCard
                label="Avg |\u0394| (\u20B9)"
                value={
                  aggregate.avg_absolute_delta_paise !== null
                    ? fmtINR(aggregate.avg_absolute_delta_paise)
                    : "\u2014"
                }
                colorClass={deltaColor(aggregate.avg_percentage_delta)}
              />
              <StatCard
                label="Avg \u0394 (%)"
                value={fmtPct(aggregate.avg_percentage_delta)}
                colorClass={deltaColor(aggregate.avg_percentage_delta)}
              />
              <StatCard
                label="Max \u0394"
                value={fmtDelta(aggregate.max_delta_paise)}
                colorClass="text-emerald-700"
              />
              <StatCard
                label="Min \u0394"
                value={fmtDelta(aggregate.min_delta_paise)}
                colorClass="text-red-700"
              />
              <StatCard label="Median \u0394" value={fmtDelta(aggregate.median_delta_paise)} />
              <StatCard
                label="Avg &Delta; (%)"
                value={fmtPct(aggregate.avg_percentage_delta)}
                colorClass={deltaColor(aggregate.avg_percentage_delta)}
              />
              <StatCard
                label="Max &Delta;"
                value={fmtDelta(aggregate.max_delta_paise)}
                colorClass="text-emerald-700"
              />
              <StatCard
                label="Min &Delta;"
                value={fmtDelta(aggregate.min_delta_paise)}
                colorClass="text-red-700"
              />
              <StatCard label="Median &Delta;" value={fmtDelta(aggregate.median_delta_paise)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Per-Closure Delta Table ─────────────────────── */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">
            Per-Closure Deltas
            {totalCount > 0 && (
              <Badge
                variant="outline"
                className="ml-2 border-slate-300 text-xs font-normal text-slate-500"
              >
                {totalCount}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Individual shadow mode comparison results, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deltasResult === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={`row-skel-${String(i)}`} className="h-10 w-full rounded" />
              ))}
            </div>
          ) : deltas.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
              No shadow deltas recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-2.5 font-medium">Date</th>
                    <th className="px-3 py-2.5 font-medium">Entity Type</th>
                    <th className="px-3 py-2.5 font-medium">Persona</th>
                    <th className="px-3 py-2.5 text-right font-medium">{`V2 (\u20B9)`}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{`V3 (\u20B9)`}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{`\u0394 (\u20B9)`}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{`\u0394 (%)`}</th>
                    <th className="px-3 py-2.5 font-medium">Config</th>
                  </tr>
                </thead>
                <tbody>
                  {(deltas as ShadowDelta[]).map((delta) => {
                    const v2 = extractAmount(delta.v2_result_json);
                    const v3 = extractAmount(delta.v3_result_json);
                    const parsed = extractDelta(delta.delta_summary);

                    return (
                      <tr
                        key={delta._id}
                        className="border-b border-slate-100 text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <td className="px-3 py-2.5 text-slate-600">{fmtDate(delta.created_at)}</td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs capitalize",
                              ENTITY_BADGE_CLASS[delta.entity_type] ?? "border-slate-300",
                            )}
                          >
                            {delta.entity_type}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-xs">{delta.persona ?? "\u2014"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {v2 !== null ? fmtINR(v2) : "\u2014"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {v3 !== null ? fmtINR(v3) : "\u2014"}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right font-medium tabular-nums",
                            deltaColor(parsed?.deltaPaise),
                          )}
                        >
                          {fmtDelta(parsed?.deltaPaise)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right tabular-nums",
                            deltaColor(parsed?.deltaPct),
                          )}
                        >
                          {fmtPct(parsed?.deltaPct)}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-500">
                          {delta.config_version_id ? truncateId(delta.config_version_id) : "\u2014"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
