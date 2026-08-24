"use client";

import { useMemo, useState } from "react";
import { Bike, BusFront, Car, Footprints, TrainFront } from "lucide-react";
import {
  BANGALORE_AREAS,
  TRANSPORT_MODES,
  type BangaloreArea,
  type TransportMode,
  estimateCommute,
} from "@/lib/commute-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const modeIcons: Record<TransportMode, typeof Car> = {
  DRIVE: Car,
  BIKE: Bike,
  BUS: BusFront,
  METRO: TrainFront,
  WALK: Footprints,
};

export function CommuteEstimator() {
  const [fromArea, setFromArea] = useState<BangaloreArea>(BANGALORE_AREAS[0]);
  const [toArea, setToArea] = useState<BangaloreArea>(BANGALORE_AREAS[1]);
  const [mode, setMode] = useState<TransportMode>("DRIVE");

  const estimate = useMemo(() => estimateCommute(fromArea, toArea, mode), [fromArea, mode, toArea]);
  const isSameArea = fromArea === toArea;

  return (
    <Card className="py-0">
      <CardHeader>
        <CardTitle>Estimate your daily commute</CardTitle>
        <CardDescription>Pick two Bangalore areas and choose your transport mode.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pb-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-800">From</p>
            <Select value={fromArea} onValueChange={(value) => setFromArea(value as BangaloreArea)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select area" />
              </SelectTrigger>
              <SelectContent>
                {BANGALORE_AREAS.map((area) => (
                  <SelectItem key={area} value={area}>
                    {area}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-800">To</p>
            <Select value={toArea} onValueChange={(value) => setToArea(value as BangaloreArea)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select area" />
              </SelectTrigger>
              <SelectContent>
                {BANGALORE_AREAS.map((area) => (
                  <SelectItem key={area} value={area}>
                    {area}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-800">Travel mode</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(Object.keys(TRANSPORT_MODES) as TransportMode[]).map((transportMode) => {
              const Icon = modeIcons[transportMode];

              return (
                <Button
                  key={transportMode}
                  type="button"
                  onClick={() => setMode(transportMode)}
                  variant={mode === transportMode ? "default" : "outline"}
                  className="h-auto w-full gap-2 px-3 py-2"
                >
                  <Icon className="size-4" />
                  {TRANSPORT_MODES[transportMode].label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          {isSameArea ? (
            <p className="text-sm font-medium text-emerald-700">You&apos;re already there!</p>
          ) : estimate ? (
            <div className="space-y-1">
              <p className="text-sm text-slate-600">
                {TRANSPORT_MODES[mode].label} estimate from{" "}
                <span className="font-semibold">{fromArea}</span> to{" "}
                <span className="font-semibold">{toArea}</span>
              </p>
              <p className="text-lg font-bold text-slate-900">
                {estimate.distanceKm.toFixed(1)} km • {estimate.timeMinutes} mins
              </p>
            </div>
          ) : (
            <p className="text-sm font-medium text-amber-700">
              Estimate unavailable for this route.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
