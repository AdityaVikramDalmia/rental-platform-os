"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { calculateRentCosts } from "@/lib/rent-calculator";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function RentCalculator() {
  const [monthlyRent, setMonthlyRent] = useState(20000);
  const [depositMonths, setDepositMonths] = useState(2);
  const [maintenance, setMaintenance] = useState(2000);
  const [brokerage, setBrokerage] = useState(10);

  const outputs = useMemo(
    () =>
      calculateRentCosts({
        monthlyRent,
        depositMonths,
        maintenance,
        brokerage,
      }),
    [brokerage, depositMonths, maintenance, monthlyRent],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <Card className="py-0">
        <CardHeader>
          <CardTitle>Inputs</CardTitle>
          <CardDescription>Adjust your expected rental terms.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pb-6">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">Monthly Rent</p>
              <p className="text-sm font-semibold tabular-nums text-slate-900">
                {currencyFormatter.format(monthlyRent)}
              </p>
            </div>
            <Slider
              value={[monthlyRent]}
              min={5000}
              max={100000}
              step={1000}
              onValueChange={([value]) => setMonthlyRent(value)}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">Security Deposit</p>
              <p className="text-sm font-semibold tabular-nums text-slate-900">
                {depositMonths} months
              </p>
            </div>
            <Slider
              value={[depositMonths]}
              min={1}
              max={12}
              step={1}
              onValueChange={([value]) => setDepositMonths(value)}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">Maintenance</p>
              <p className="text-sm font-semibold tabular-nums text-slate-900">
                {currencyFormatter.format(maintenance)}
              </p>
            </div>
            <Slider
              value={[maintenance]}
              min={0}
              max={10000}
              step={500}
              onValueChange={([value]) => setMaintenance(value)}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">Brokerage</p>
              <p className="text-sm font-semibold tabular-nums text-slate-900">{brokerage}%</p>
            </div>
            <Slider
              value={[brokerage]}
              min={0}
              max={100}
              step={5}
              onValueChange={([value]) => setBrokerage(value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-300 py-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Cost Summary</CardTitle>
            <Badge variant="outline">Live</Badge>
          </div>
          <CardDescription>Real-time breakdown based on your slider values.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Security Deposit Amount</span>
            <span className="font-medium tabular-nums text-slate-900">
              {currencyFormatter.format(outputs.depositAmount)}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Brokerage Amount</span>
            <span className="font-medium tabular-nums text-slate-900">
              {currencyFormatter.format(outputs.brokerageAmount)}
            </span>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Total Move-in Cost
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-900">
              {currencyFormatter.format(outputs.totalMoveInCost)}
            </p>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
              Monthly Recurring
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-blue-900">
              {currencyFormatter.format(outputs.monthlyRecurring)}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
