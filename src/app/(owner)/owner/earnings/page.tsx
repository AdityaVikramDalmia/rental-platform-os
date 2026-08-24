"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Wallet } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import { OwnerEarningsSummary } from "@/components/owner/earnings/OwnerEarningsSummary";
import { OwnerEarningsTimeline } from "@/components/owner/earnings/OwnerEarningsTimeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function EarningsLoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {["summary-1", "summary-2", "summary-3", "summary-4"].map((key) => (
          <Card key={key} className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-2 p-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-3">
        {["timeline-1", "timeline-2", "timeline-3"].map((key) => (
          <Card key={key} className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-2 p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function OwnerEarningsPage() {
  const searchParams = useSearchParams();
  const selectedLeadId = searchParams.get("leadId");
  const earnings = useQuery(api.owners.getMyEarnings);

  if (earnings === undefined) {
    return (
      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Earnings</h1>
          <p className="text-sm text-slate-600">Track payout status and disbursal history.</p>
        </header>
        <EarningsLoadingState />
      </div>
    );
  }

  const filteredRows = selectedLeadId
    ? earnings.rows.filter((row) => String(row.lead_id) === selectedLeadId)
    : earnings.rows;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Wallet className="size-5 text-indigo-700" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Earnings</h1>
        </div>
        <p className="text-sm text-slate-600">Track payout status and disbursal history.</p>
      </header>

      {selectedLeadId ? (
        <Card className="border-indigo-200 bg-indigo-50/70 shadow-sm">
          <CardContent className="flex items-center justify-between gap-3 p-3">
            <p className="text-xs text-indigo-900">
              Filtered to payouts linked to one property lead.
            </p>
            <Button asChild size="sm" variant="outline" className="border-indigo-300 bg-white">
              <Link href="/owner/earnings">Clear Filter</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <OwnerEarningsSummary summary={earnings.summary} />

      {selectedLeadId && filteredRows.length === 0 && earnings.rows.length > 0 ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardContent className="space-y-2 p-6 text-center">
            <p className="text-sm font-medium text-slate-800">No payouts match this lead filter.</p>
            <Button asChild variant="outline">
              <Link href="/owner/earnings">Show Full Timeline</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <OwnerEarningsTimeline
          rows={filteredRows.map((row) => ({
            payout_id: String(row.payout_id),
            closure_id: String(row.closure_id),
            lead_id: String(row.lead_id),
            status: row.status,
            amount_paise: row.amount_paise,
            building_name: row.building_name,
            flat_number: row.flat_number,
            confirmed_at: row.confirmed_at,
            disbursed_at: row.disbursed_at,
            payment_reference: row.payment_reference,
          }))}
        />
      )}
    </div>
  );
}
