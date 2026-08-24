"use client";

import { formatINR } from "../../../lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BrokerageDisplayProps {
  tenantBrokeragePaise: number;
  ownerBrokeragePaise: number;
  compact?: boolean;
}

function BrokerageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export function BrokerageDisplay({
  tenantBrokeragePaise,
  ownerBrokeragePaise,
  compact = false,
}: BrokerageDisplayProps) {
  const totalBrokeragePaise = tenantBrokeragePaise + ownerBrokeragePaise;

  if (compact) {
    return (
      <p className="text-xs text-slate-600">
        Brokerage:{" "}
        <span className="font-semibold text-slate-900">{formatINR(tenantBrokeragePaise)}</span>
        {" / "}
        <span className="font-semibold text-slate-900">{formatINR(ownerBrokeragePaise)}</span>
      </p>
    );
  }

  return (
    <Card className="border-slate-200 py-0">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-sm font-semibold text-slate-900">Brokerage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4">
        <BrokerageRow label="Tenant Brokerage" value={formatINR(tenantBrokeragePaise)} />
        <BrokerageRow label="Owner Brokerage" value={formatINR(ownerBrokeragePaise)} />
        <div className="border-t border-slate-200 pt-2">
          <BrokerageRow label="Total" value={formatINR(totalBrokeragePaise)} />
        </div>
      </CardContent>
    </Card>
  );
}

export type { BrokerageDisplayProps };
