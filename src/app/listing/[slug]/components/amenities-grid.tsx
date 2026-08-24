"use client";

import { Check, X } from "lucide-react";
import { AMENITIES } from "../../../../../lib/constants";
import { getAmenityIcon, getAmenityLabel } from "@/lib/amenity-icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AmenitiesGridProps = {
  amenities: string[];
};

export function AmenitiesGrid({ amenities }: AmenitiesGridProps) {
  const amenitySet = new Set(amenities);

  const sortedAmenities = [...AMENITIES].sort((a, b) => {
    const aHas = amenitySet.has(a) ? 0 : 1;
    const bHas = amenitySet.has(b) ? 0 : 1;
    return aHas - bHas;
  });

  return (
    <Card className="border-0 shadow-md">
      <CardHeader>
        <CardTitle className="text-lg">Amenities</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {sortedAmenities.map((amenity) => {
            const isAvailable = amenitySet.has(amenity);
            const Icon = getAmenityIcon(amenity);
            const label = getAmenityLabel(amenity);

            return (
              <div
                key={amenity}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors ${
                  isAvailable ? "bg-emerald-50/80 dark:bg-emerald-950/20" : "bg-muted/40"
                }`}
              >
                {isAvailable ? (
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                ) : (
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                    <X className="size-3.5 text-muted-foreground/60" />
                  </div>
                )}
                <Icon
                  className={`size-4 shrink-0 ${
                    isAvailable
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground/50"
                  }`}
                />
                <span
                  className={`text-sm ${
                    isAvailable
                      ? "font-medium text-foreground"
                      : "text-muted-foreground line-through"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
