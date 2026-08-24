"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { SortableHeader, type SortState } from "@/components/admin/SortableHeader";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type PipelineRow = {
  id: string;
  details: string;
  status: string;
  agent_name: string | null;
  days_stuck: number;
  link: string;
};

type PipelineAgingSectionProps = {
  value: string;
  title: string;
  rows: PipelineRow[];
};

function getDaysBadgeClass(daysStuck: number): string {
  if (daysStuck > 14) {
    return "bg-red-100 text-red-700";
  }

  if (daysStuck > 7) {
    return "bg-orange-100 text-orange-700";
  }

  return "bg-yellow-100 text-yellow-800";
}

function truncateId(id: string): string {
  if (id.length <= 12) {
    return id;
  }

  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function PipelineAgingSection({ value, title, rows }: PipelineAgingSectionProps) {
  const [sortState, setSortState] = useState<SortState>({
    column: "days_stuck",
    direction: "desc",
  });

  const sortedRows = useMemo(() => {
    const nextRows = [...rows];

    nextRows.sort((a, b) => {
      if (sortState.column === "days_stuck") {
        return sortState.direction === "asc"
          ? a.days_stuck - b.days_stuck
          : b.days_stuck - a.days_stuck;
      }

      if (sortState.column === "status") {
        return sortState.direction === "asc"
          ? a.status.localeCompare(b.status)
          : b.status.localeCompare(a.status);
      }

      if (sortState.column === "agent") {
        const aAgent = a.agent_name ?? "Unassigned";
        const bAgent = b.agent_name ?? "Unassigned";
        return sortState.direction === "asc"
          ? aAgent.localeCompare(bAgent)
          : bAgent.localeCompare(aAgent);
      }

      return sortState.direction === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    });

    return nextRows;
  }, [rows, sortState]);

  const handleSortAction = (column: string) => {
    setSortState((current) => {
      if (current.column !== column) {
        return {
          column,
          direction: "asc",
        };
      }

      return {
        column,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
  };

  return (
    <AccordionItem value={value} className="rounded-lg border border-slate-200 px-4 last:border-b">
      <AccordionTrigger className="py-3 text-left text-sm font-medium text-slate-900 hover:no-underline">
        {title} ({rows.length})
      </AccordionTrigger>

      <AccordionContent className="pb-4">
        {sortedRows.length === 0 ? (
          <p className="text-sm text-slate-600">No stale items in this category.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <SortableHeader
                    column="id"
                    label="Entity ID"
                    currentSort={sortState}
                    onSortAction={handleSortAction}
                  />
                  <th className="px-3 py-2.5 font-medium">Details</th>
                  <SortableHeader
                    column="status"
                    label="Status"
                    currentSort={sortState}
                    onSortAction={handleSortAction}
                  />
                  <SortableHeader
                    column="agent"
                    label="Agent"
                    currentSort={sortState}
                    onSortAction={handleSortAction}
                  />
                  <SortableHeader
                    column="days_stuck"
                    label="Days Stuck"
                    currentSort={sortState}
                    onSortAction={handleSortAction}
                  />
                  <th className="px-3 py-2.5 font-medium">Action</th>
                </tr>
              </thead>

              <tbody>
                {sortedRows.map((row) => (
                  <tr key={`${value}-${row.id}`} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-700">
                      {truncateId(row.id)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-800">{row.details}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="border-slate-300 text-slate-700">
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{row.agent_name ?? "Unassigned"}</td>
                    <td className="px-3 py-2.5">
                      <Badge className={getDaysBadgeClass(row.days_stuck)}>{row.days_stuck}d</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={row.link}
                        className="text-sm font-medium text-slate-700 hover:text-slate-900"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export function PipelineAgingPanel() {
  const pipeline = useQuery(api.opsManagement.getStagnantPipeline);

  if (pipeline === undefined) {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Pipeline Aging</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const staleLeadRows: PipelineRow[] = pipeline.stale_leads.map((lead) => ({
    id: lead.id,
    details: `${lead.society_name} - Flat ${lead.flat_no}`,
    status: lead.status,
    agent_name: lead.agent_name,
    days_stuck: lead.days_stuck,
    link: lead.link,
  }));

  const staleVisitRows: PipelineRow[] = pipeline.stale_visits.map((visit) => ({
    id: visit.id,
    details: visit.listing_label,
    status: visit.status,
    agent_name: visit.agent_name,
    days_stuck: visit.days_stuck,
    link: visit.link,
  }));

  const staleNegotiationRows: PipelineRow[] = pipeline.stale_negotiations.map((negotiation) => ({
    id: negotiation.id,
    details: negotiation.listing_label,
    status: negotiation.status,
    agent_name: negotiation.agent_name,
    days_stuck: negotiation.days_stuck,
    link: negotiation.link,
  }));

  if (pipeline.total_stale_count === 0) {
    return (
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">Pipeline Aging</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">No stale pipeline items.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border border-slate-200 bg-white">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base text-slate-900">
          Pipeline Aging ({pipeline.total_stale_count})
        </CardTitle>
        <p className="text-xs text-slate-500">
          Sorted by days stuck by default. Click column headers to re-sort.
        </p>
      </CardHeader>

      <CardContent>
        <Accordion
          type="multiple"
          defaultValue={["leads", "visits", "negotiations"]}
          className="space-y-3"
        >
          <PipelineAgingSection value="leads" title="Stale Leads" rows={staleLeadRows} />
          <PipelineAgingSection value="visits" title="Stale Visits" rows={staleVisitRows} />
          <PipelineAgingSection
            value="negotiations"
            title="Stale Negotiations"
            rows={staleNegotiationRows}
          />
        </Accordion>
      </CardContent>
    </Card>
  );
}
