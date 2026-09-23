"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChevronDown, ChevronUp, ScrollText } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AuditChangeDiff } from "@/app/(admin)/admin/audit/components/audit-change-diff";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type GuardAuditTabProps = {
  guardId: Id<"guard_profiles">;
};

type AuditEntry = {
  _id: Id<"audit_logs">;
  _creationTime: number;
  actor_name: string;
  action: string;
  changes?: Array<{ field: string; old_value: unknown; new_value: unknown }>;
  metadata?: unknown;
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "\u2014";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "[complex value]";
  }
}

function summarizeChanges(changes: AuditEntry["changes"]): string {
  if (!changes || changes.length === 0) {
    return "No field-level changes";
  }

  const [firstChange] = changes;
  const summary = `${firstChange.field}: ${formatChangeValue(firstChange.old_value)} \u2192 ${formatChangeValue(firstChange.new_value)}`;

  if (changes.length === 1) {
    return summary;
  }

  return `${summary} (+${changes.length - 1} more)`;
}

export function GuardAuditTab({ guardId }: GuardAuditTabProps) {
  const [activeAction, setActiveAction] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<Id<"audit_logs"> | null>(null);

  const auditResponse = useQuery(api.auditLogs.list, {
    paginationOpts: { numItems: 10, cursor: null },
    entity_type: "guard_profiles",
    entity_id: guardId,
  });

  const entries = (auditResponse?.page ?? []) as AuditEntry[];
  const isLoading = auditResponse === undefined;

  const actionOptions = useMemo(() => {
    const actions = new Set(entries.map((entry) => entry.action));
    return ["ALL", ...Array.from(actions).sort()];
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (activeAction === "ALL") {
      return entries;
    }

    return entries.filter((entry) => entry.action === activeAction);
  }, [activeAction, entries]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={activeAction} onValueChange={setActiveAction}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Filter action" />
          </SelectTrigger>
          <SelectContent>
            {actionOptions.map((action) => (
              <SelectItem key={action} value={action}>
                {action === "ALL" ? "All actions" : action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Link
          href={`/admin/audit?entity_type=guard_profiles&entity_id=${guardId}`}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          View all in Audit Log
        </Link>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Timestamp</th>
                  <th className="px-3 py-2.5 font-medium">Action</th>
                  <th className="px-3 py-2.5 font-medium">Actor</th>
                  <th className="px-3 py-2.5 font-medium">Changes Summary</th>
                  <th className="px-3 py-2.5 font-medium">Diff</th>
                </tr>
              </thead>

              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, index) => (
                      <tr
                        key={`guard-audit-skeleton-${index}`}
                        className="border-b border-slate-100"
                      >
                        {Array.from({ length: 5 }).map((__, colIndex) => (
                          <td
                            key={`guard-audit-skeleton-${index}-${colIndex}`}
                            className="px-3 py-3"
                          >
                            <Skeleton className="h-4 w-28" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : filteredEntries.map((entry) => {
                      const isExpanded = expandedId === entry._id;
                      const hasExpandableDiff =
                        (entry.changes?.length ?? 0) > 0 || entry.action.endsWith("_INSERT");

                      return (
                        <Fragment key={entry._id}>
                          <tr className="border-b border-slate-100 text-slate-800">
                            <td className="px-3 py-3 text-slate-700">
                              {DATE_TIME_FORMATTER.format(entry._creationTime)}
                            </td>
                            <td className="px-3 py-3 font-medium text-slate-900">{entry.action}</td>
                            <td className="px-3 py-3 text-slate-700">
                              {entry.actor_name || "System"}
                            </td>
                            <td className="max-w-[340px] truncate px-3 py-3 text-slate-700">
                              {summarizeChanges(entry.changes)}
                            </td>
                            <td className="px-3 py-3">
                              {hasExpandableDiff ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setExpandedId(isExpanded ? null : entry._id)}
                                  className="h-7 gap-1 text-xs text-slate-500"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="size-3.5" />
                                  ) : (
                                    <ChevronDown className="size-3.5" />
                                  )}
                                  {isExpanded ? "Hide" : "View"}
                                </Button>
                              ) : (
                                <span className="text-slate-400">{"\u2014"}</span>
                              )}
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="border-b border-slate-100">
                              <td colSpan={5} className="px-3 py-3">
                                <AuditChangeDiff
                                  action={entry.action}
                                  changes={entry.changes}
                                  metadata={entry.metadata}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {!isLoading && filteredEntries.length === 0 && (
            <div className="py-12 text-center">
              <ScrollText className="mx-auto mb-3 size-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">
                No audit events found for this guard.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
