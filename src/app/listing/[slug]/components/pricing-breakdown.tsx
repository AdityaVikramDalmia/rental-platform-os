"use client";

import { Building2, Calendar, Car, IndianRupee, PawPrint, Ruler } from "lucide-react";
import { useState } from "react";
import { formatINR } from "../../../../../lib/money";
import { formatDate } from "../../../../../lib/dates";
import { FURNISHING, PARKING } from "../../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type PricingBreakdownProps = {
  bhk_config: string;
  rent_monthly: number;
  deposit?: number;
  maintenance?: number;
  furnishing: string;
  carpet_area_sqft?: number;
  floor_number: string;
  available_from: number;
  parking?: string;
  pet_friendly?: boolean;
};

const FURNISHING_LABELS: Record<string, string> = {
  [FURNISHING.UNFURNISHED]: "Unfurnished",
  [FURNISHING.SEMI_FURNISHED]: "Semi-Furnished",
  [FURNISHING.FULLY_FURNISHED]: "Fully Furnished",
};

const PARKING_LABELS: Record<string, string> = {
  [PARKING.NONE]: "No Parking",
  [PARKING.COVERED]: "Covered Parking",
  [PARKING.OPEN]: "Open Parking",
  [PARKING.BOTH]: "Covered + Open Parking",
};

export function PricingBreakdown({
  bhk_config,
  rent_monthly,
  deposit,
  maintenance,
  furnishing,
  carpet_area_sqft,
  floor_number,
  available_from,
  parking,
  pet_friendly,
}: PricingBreakdownProps) {
  const furnishingLabel = FURNISHING_LABELS[furnishing] ?? furnishing;
  const hasDeposit = deposit !== undefined && deposit > 0;
  const hasMaintenance = maintenance !== undefined && maintenance > 0;
  const moveInCost = rent_monthly + (hasDeposit ? deposit : 0) + (hasMaintenance ? maintenance : 0);
  const [now] = useState(() => Date.now());
  const isAvailableNow = available_from <= now;

  return (
    <Card className="overflow-hidden border-0 shadow-md">
      <CardHeader className="bg-gradient-to-br from-slate-900 to-slate-800 pb-5 pt-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-baseline gap-1.5 text-2xl tracking-tight text-white sm:text-3xl">
              <IndianRupee className="size-5 shrink-0 opacity-70" />
              {formatINR(rent_monthly).replace("₹", "")}
              <span className="text-sm font-normal text-slate-400">/month</span>
            </CardTitle>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-300">
              <span>{furnishingLabel}</span>
              {carpet_area_sqft !== undefined && (
                <>
                  <span className="text-slate-500">•</span>
                  <span className="inline-flex items-center gap-1">
                    <Ruler className="size-3.5" />
                    {carpet_area_sqft.toLocaleString("en-IN")} sqft
                  </span>
                </>
              )}
              <span className="text-slate-500">•</span>
              <span className="inline-flex items-center gap-1">
                <Building2 className="size-3.5" />
                Floor {floor_number}
              </span>
            </p>
          </div>
          <Badge
            variant="secondary"
            className="shrink-0 bg-blue-500/20 text-blue-200 backdrop-blur-sm"
          >
            {bhk_config}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="space-y-3">
          <CostRow label="Monthly Rent" amount={formatINR(rent_monthly)} bold />
          {hasDeposit && <CostRow label="Security Deposit" amount={formatINR(deposit)} />}
          {hasMaintenance && (
            <CostRow label="Maintenance" amount={formatINR(maintenance)} suffix="/mo" />
          )}

          {(hasDeposit || hasMaintenance) && (
            <>
              <Separator className="my-2" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Move-in Cost</p>
                  <p className="text-xs text-muted-foreground">
                    Rent{hasDeposit ? " + Deposit" : ""}
                    {hasMaintenance ? " + Maintenance" : ""}
                  </p>
                </div>
                <p className="text-lg font-bold tracking-tight text-foreground">
                  {formatINR(moveInCost)}
                </p>
              </div>
            </>
          )}
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoChip
            icon={<Calendar className="size-4" />}
            label="Available from"
            value={
              isAvailableNow ? (
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                  Available Now
                </Badge>
              ) : (
                formatDate(available_from)
              )
            }
          />
          {parking !== undefined && parking !== PARKING.NONE && (
            <InfoChip
              icon={<Car className="size-4" />}
              label="Parking"
              value={PARKING_LABELS[parking] ?? parking}
            />
          )}
          {parking === PARKING.NONE && (
            <InfoChip icon={<Car className="size-4" />} label="Parking" value="No Parking" />
          )}
          {pet_friendly !== undefined && (
            <InfoChip
              icon={<PawPrint className="size-4" />}
              label="Pet Friendly"
              value={
                pet_friendly ? (
                  <span className="font-medium text-emerald-600">Yes</span>
                ) : (
                  <span className="text-muted-foreground">No</span>
                )
              }
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CostRow({
  label,
  amount,
  suffix,
  bold,
}: {
  label: string;
  amount: string;
  suffix?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-semibold text-foreground" : "text-foreground"}>
        {amount}
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </span>
    </div>
  );
}

function InfoChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5">
      <div className="text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium text-foreground">{value}</div>
      </div>
    </div>
  );
}
