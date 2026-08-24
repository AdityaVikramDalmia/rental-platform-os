"use client";

import Link from "next/link";
import { PAYOUT_STATUS, type PayoutStatus } from "../../../../lib/constants";
import { formatDateTime } from "../../../../lib/dates";
import { PayoutStatusBadge } from "@/components/shared/payout-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type OwnerEarningsTimelineRow = {
  payout_id: string;
  closure_id: string;
  lead_id: string;
  status: PayoutStatus;
  amount_paise: number;
  building_name: string | null;
  flat_number: string;
  confirmed_at?: number;
  disbursed_at?: number;
  payment_reference?: string;
};

type OwnerEarningsTimelineProps = {
  rows: OwnerEarningsTimelineRow[];
};

function formatInr(amountPaise: number): string {
  return (amountPaise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export function OwnerEarningsTimeline({ rows }: OwnerEarningsTimelineProps) {
  if (rows.length === 0) {
    return (
      <Card className="border-dashed border-slate-300 bg-white">
        <CardContent className="space-y-2 p-6 text-center">
          <p className="text-sm font-medium text-slate-800">No payouts yet</p>
          <p className="text-sm text-slate-600">
            Payout history will appear here after closure confirmation and processing.
          </p>
        </CardContent>
      </Card>
    );
  }

  const bucketedRows = {
    pendingApproved: rows.filter(
      (row) => row.status === PAYOUT_STATUS.PENDING || row.status === PAYOUT_STATUS.APPROVED,
    ),
    disbursed: rows.filter((row) => row.status === PAYOUT_STATUS.DISBURSED),
    failedVoided: rows.filter(
      (row) => row.status === PAYOUT_STATUS.FAILED || row.status === PAYOUT_STATUS.VOIDED,
    ),
  };

  const sections = [
    {
      id: "pending-approved",
      title: "Pending / Approved",
      rows: bucketedRows.pendingApproved,
    },
    {
      id: "disbursed",
      title: "Disbursed",
      rows: bucketedRows.disbursed,
    },
    {
      id: "failed-voided",
      title: "Failed / Voided",
      rows: bucketedRows.failedVoided,
    },
  ] as const;

  return (
    <div className="space-y-4">
      {sections.map((section) => {
        if (section.rows.length === 0) {
          return null;
        }

        const sectionTotal = section.rows.reduce((sum, row) => sum + row.amount_paise, 0);

        return (
          <section key={section.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">
                {section.title}
              </h2>
              <p className="text-xs font-medium text-slate-500">{formatInr(sectionTotal)}</p>
            </div>
            <div className="space-y-2">
              {section.rows.map((row) => (
                <Card key={row.payout_id} className="border-slate-200 bg-white shadow-sm">
                  <CardHeader className="space-y-2 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm font-semibold text-slate-900">
                        {[row.building_name, row.flat_number ? `Flat ${row.flat_number}` : null]
                          .filter(Boolean)
                          .join(" - ") || "Property payout"}
                      </CardTitle>
                      <PayoutStatusBadge status={row.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    <p className="text-base font-semibold text-slate-900">
                      {formatInr(row.amount_paise)}
                    </p>
                    <div className="space-y-1 text-xs text-slate-600">
                      {row.confirmed_at ? (
                        <p>Closure confirmed: {formatDateTime(row.confirmed_at)}</p>
                      ) : null}
                      {row.disbursed_at ? (
                        <p>Disbursed: {formatDateTime(row.disbursed_at)}</p>
                      ) : null}
                      {row.payment_reference ? <p>Reference: {row.payment_reference}</p> : null}
                    </div>
                    <Link
                      href={`/owner/leads?leadId=${encodeURIComponent(row.lead_id)}`}
                      className="inline-flex text-xs font-medium text-indigo-700 hover:text-indigo-800"
                    >
                      View lead details
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
