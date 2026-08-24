"use client";

import { useQuery } from "convex/react";
import { ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { formatDateTime } from "../../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type FingerprintHistoryProps = {
  guardUserId: Id<"users">;
};

type FingerprintEntry = {
  fingerprint: string;
  first_seen: number;
  last_seen: number;
  flagged: boolean;
  ip?: string;
  device_label?: string;
};

function truncateFingerprint(fingerprint: string): string {
  if (fingerprint.length <= 20) {
    return fingerprint;
  }

  return `${fingerprint.slice(0, 10)}...${fingerprint.slice(-6)}`;
}

export function FingerprintHistory({ guardUserId }: FingerprintHistoryProps) {
  const [showHistory, setShowHistory] = useState(false);
  const history = useQuery(api.guards.getFingerprintHistory, { guard_user_id: guardUserId });

  const sortedHistory = useMemo(() => {
    return (history ?? []).slice().sort((a, b) => b.last_seen - a.last_seen) as FingerprintEntry[];
  }, [history]);

  const latest = sortedHistory[0];

  if (history === undefined) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Fingerprint History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (sortedHistory.length === 0) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Fingerprint History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">No fingerprint records found for this guard yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base text-slate-900">Fingerprint History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Last Login Summary</p>
            {latest.flagged ? (
              <Badge className="border-amber-300 bg-amber-100 text-amber-900">
                <ShieldAlert className="size-3" />
                Flagged
              </Badge>
            ) : (
              <Badge className="border-emerald-300 bg-emerald-100 text-emerald-900">Trusted</Badge>
            )}
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p className="text-slate-700">
              <span className="font-medium text-slate-900">Fingerprint:</span>{" "}
              <span className="font-mono">{truncateFingerprint(latest.fingerprint)}</span>
            </p>
            <p className="text-slate-700">
              <span className="font-medium text-slate-900">Last Seen:</span>{" "}
              {formatDateTime(latest.last_seen)}
            </p>
            <p className="text-slate-700">
              <span className="font-medium text-slate-900">IP:</span> {latest.ip ?? "—"}
            </p>
            <p className="text-slate-700">
              <span className="font-medium text-slate-900">Device:</span>{" "}
              {latest.device_label ?? "—"}
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-300 text-slate-700"
            onClick={() => setShowHistory((prev) => !prev)}
          >
            {showHistory ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {showHistory
              ? "Hide Full History"
              : `Show Full History (${sortedHistory.length} device${sortedHistory.length === 1 ? "" : "s"})`}
          </Button>
        </div>

        {showHistory ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-3 py-2 font-medium">First Seen</th>
                  <th className="px-3 py-2 font-medium">Last Seen</th>
                  <th className="px-3 py-2 font-medium">Fingerprint</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium">Device Label</th>
                </tr>
              </thead>
              <tbody>
                {sortedHistory.map((entry, index) => (
                  <tr
                    key={`${entry.fingerprint}-${entry.first_seen}-${index}`}
                    className={entry.flagged ? "bg-amber-50" : "bg-white"}
                  >
                    <td className="px-3 py-2 text-slate-700">{formatDateTime(entry.first_seen)}</td>
                    <td className="px-3 py-2 text-slate-700">{formatDateTime(entry.last_seen)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-800">
                      {truncateFingerprint(entry.fingerprint)}
                    </td>
                    <td className="px-3 py-2">
                      {entry.flagged ? (
                        <Badge className="border-amber-300 bg-amber-100 text-amber-900">
                          Flagged
                        </Badge>
                      ) : (
                        <Badge className="border-emerald-300 bg-emerald-100 text-emerald-900">
                          Trusted
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{entry.ip ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{entry.device_label ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
