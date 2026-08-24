"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { api } from "../../../../../../convex/_generated/api";
import { formatINR } from "../../../../../../lib/money";
import type { PersonaFilter, TimeWindow } from "../page";
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

type GuardLeaderboardTabProps = {
  timeWindow: TimeWindow;
  hasPayoutsView: boolean;
  personaFilter: PersonaFilter;
  onPersonaFilterChangeAction: (value: PersonaFilter) => void;
};

type Metric = "leads" | "verified" | "verified_rate" | "visits" | "closures" | "earned";

const LIMIT_OPTIONS = [10, 20, 50] as const;

export function GuardLeaderboardTab({
  timeWindow,
  hasPayoutsView,
  personaFilter,
  onPersonaFilterChangeAction,
}: GuardLeaderboardTabProps) {
  const [metric, setMetric] = useState<Metric>("verified");
  const [limit, setLimit] = useState<number>(20);
  const [societySearch, setSocietySearch] = useState("");
  const [selectedSocietyId, setSelectedSocietyId] = useState<Id<"societies"> | null>(null);

  const societies = useQuery(api.analytics.getSocietyComparison, { time_window: "all_time" });

  const leaderboardArgs = useMemo(() => {
    const args: {
      metric: Metric;
      time_window: TimeWindow;
      limit: number;
      persona_filter: PersonaFilter;
      society_id?: Id<"societies">;
    } = {
      metric,
      time_window: timeWindow,
      limit,
      persona_filter: personaFilter,
    };

    if (selectedSocietyId) {
      args.society_id = selectedSocietyId;
    }

    return args;
  }, [limit, metric, personaFilter, selectedSocietyId, timeWindow]);

  const leaderboard = useQuery(api.analytics.getGuardLeaderboard, leaderboardArgs);

  const filteredSocieties = useMemo(() => {
    if (!societies) {
      return [];
    }

    const search = societySearch.trim().toLowerCase();
    if (!search) {
      return societies;
    }

    return societies.filter((society) => {
      const haystack = `${society.society_name} ${society.city}`.toLowerCase();
      return haystack.includes(search);
    });
  }, [societies, societySearch]);

  if (leaderboard === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-7 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3">
        <CardTitle className="text-base text-slate-900">Field Worker Leaderboard</CardTitle>
        {personaFilter === "ALL" ? (
          <p className="text-xs text-slate-500">
            Mixed cohort view: combines GUARD and OPS rows with persona labels.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={personaFilter}
            onValueChange={(value) => onPersonaFilterChangeAction(value as PersonaFilter)}
          >
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="Persona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GUARD">Guards</SelectItem>
              <SelectItem value="OPS">OPS</SelectItem>
              <SelectItem value="ALL">All field workers</SelectItem>
            </SelectContent>
          </Select>

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

          <Select value={String(limit)} onValueChange={(value) => setLimit(Number(value))}>
            <SelectTrigger className="h-9 w-[120px]">
              <SelectValue placeholder="Limit" />
            </SelectTrigger>
            <SelectContent>
              {LIMIT_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  Top {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {leaderboard.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No field-worker data available for this period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Guard</th>
                  <th className="px-3 py-2.5 font-medium">Persona</th>
                  <th className="px-3 py-2.5 font-medium">Society</th>
                  <th className="px-3 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() => setMetric("leads")}
                      className={cn(metric === "leads" && "text-slate-900")}
                    >
                      Leads
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() => setMetric("verified")}
                      className={cn(metric === "verified" && "text-slate-900")}
                    >
                      Verified
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() => setMetric("verified_rate")}
                      className={cn(metric === "verified_rate" && "text-slate-900")}
                    >
                      Rate
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() => setMetric("visits")}
                      className={cn(metric === "visits" && "text-slate-900")}
                    >
                      Visits
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium">
                    <button
                      type="button"
                      onClick={() => setMetric("closures")}
                      className={cn(metric === "closures" && "text-slate-900")}
                    >
                      Closures
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-medium">
                    {hasPayoutsView ? (
                      <button
                        type="button"
                        onClick={() => setMetric("earned")}
                        className={cn(metric === "earned" && "text-slate-900")}
                      >
                        Earned
                      </button>
                    ) : (
                      <span className="text-slate-400">Earned</span>
                    )}
                  </th>
                </tr>
              </thead>

              <tbody>
                {leaderboard.map((row) => (
                  <tr key={row.guard_user_id} className="border-b border-slate-100 text-slate-800">
                    <td className="px-3 py-3 text-slate-500">{row.rank}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">
                      <Link href={`/admin/guards/${row.guard_user_id}`} className="hover:underline">
                        {row.guard_name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.persona}</td>
                    <td className="px-3 py-3 text-slate-700">{row.society_name ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {row.leads.toLocaleString("en-IN")}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {row.verified.toLocaleString("en-IN")}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {row.verified_rate === null ? "—" : `${row.verified_rate.toFixed(1)}%`}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {row.visits.toLocaleString("en-IN")}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {row.closures.toLocaleString("en-IN")}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {row.earned === null ? "—" : formatINR(row.earned)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
