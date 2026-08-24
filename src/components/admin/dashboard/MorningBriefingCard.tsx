"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function MorningBriefingCard() {
  const briefing = useQuery(api.briefing.getMorningBriefing);
  const isMorning = useMemo(() => {
    const hour = new Date().getHours();
    return hour >= 6 && hour < 12;
  }, []);

  if (briefing === undefined) {
    return <Skeleton className="h-24 w-full rounded-lg" />;
  }

  const leadCount = briefing.leads_awaiting_verification.count;
  const visitCount = briefing.visits_scheduled_today.count;
  const payoutCount = briefing.payouts_pending_approval.count;
  const payoutValue = INR_FORMATTER.format(
    briefing.payouts_pending_approval.total_amount_paise / 100,
  );
  const totalBreaches = briefing.sla_breaches.lead_breaches + briefing.sla_breaches.payout_breaches;

  const topAlertLink = briefing.top_alert.entity_id
    ? `/admin/leads?status=SUBMITTED&leadId=${encodeURIComponent(briefing.top_alert.entity_id)}`
    : null;

  if (!isMorning) {
    return (
      <Card className="border border-gray-200 bg-gray-50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-gray-700">Current Status</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/leads?status=SUBMITTED"
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100"
            >
              {leadCount} leads pending
            </Link>
            <Link
              href="/admin/visits"
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100"
            >
              {visitCount} visits today
            </Link>
            <Link
              href="/admin/payouts?status=pending"
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100"
            >
              {payoutCount} payouts pending
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-blue-900">
          Good morning! Here&apos;s your briefing.
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-sm text-blue-900/90">
          You have{" "}
          <Link
            href="/admin/leads?status=SUBMITTED"
            className="font-semibold underline underline-offset-2"
          >
            {leadCount} leads
          </Link>{" "}
          to verify,{" "}
          <Link href="/admin/visits" className="font-semibold underline underline-offset-2">
            {visitCount} visits
          </Link>{" "}
          today, and{" "}
          <Link
            href="/admin/payouts?status=pending"
            className="font-semibold underline underline-offset-2"
          >
            {payoutCount} payouts
          </Link>{" "}
          to approve.
        </p>

        <p className="text-sm text-blue-900/80">Total payout value: {payoutValue}</p>

        {briefing.top_alert.type !== "none" ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>⚠️ {briefing.top_alert.message}</span>
            {topAlertLink ? (
              <Link href={topAlertLink} className="ml-2 font-medium underline underline-offset-2">
                View
              </Link>
            ) : null}
          </div>
        ) : null}

        {totalBreaches > 0 ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            <Link
              href="/admin/leads?status=SUBMITTED"
              className="font-medium underline underline-offset-2"
            >
              🚨 {totalBreaches} SLA breach{totalBreaches > 1 ? "es" : ""} require immediate
              attention
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
