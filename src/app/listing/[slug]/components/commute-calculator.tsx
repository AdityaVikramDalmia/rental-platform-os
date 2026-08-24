"use client";

import { Briefcase, GraduationCap, Heart, ShoppingBag, Train, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CommuteLandmark = {
  _id: string;
  name: string;
  category: string;
  distance_km: number;
  time_minutes?: number;
  transport_mode?: string;
};

type CommuteCalculatorProps = {
  landmarks?: CommuteLandmark[];
};

const CATEGORY_ORDER = ["workplace", "transit", "education", "healthcare", "shopping"] as const;

const CATEGORY_CONFIG = {
  workplace: { label: "Workplaces", icon: Briefcase },
  transit: { label: "Transit", icon: Train },
  education: { label: "Education", icon: GraduationCap },
  healthcare: { label: "Healthcare", icon: Heart },
  shopping: { label: "Shopping", icon: ShoppingBag },
} as const;

function normalizeCategory(category: string): (typeof CATEGORY_ORDER)[number] {
  return CATEGORY_ORDER.includes(category as (typeof CATEGORY_ORDER)[number])
    ? (category as (typeof CATEGORY_ORDER)[number])
    : "transit";
}

function formatDistance(distanceKm: number): string {
  return `${distanceKm.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;
}

export function CommuteCalculator({ landmarks }: CommuteCalculatorProps) {
  if (!landmarks || landmarks.length === 0) {
    return null;
  }

  const grouped = landmarks.reduce(
    (acc, landmark) => {
      const key = normalizeCategory(landmark.category);
      acc[key].push(landmark);
      return acc;
    },
    {
      workplace: [] as CommuteLandmark[],
      transit: [] as CommuteLandmark[],
      education: [] as CommuteLandmark[],
      healthcare: [] as CommuteLandmark[],
      shopping: [] as CommuteLandmark[],
    },
  );

  const visibleCategories = CATEGORY_ORDER.filter((category) => grouped[category].length > 0);

  if (visibleCategories.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Commute & Nearby</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {visibleCategories.map((category) => {
          const config = CATEGORY_CONFIG[category];
          const Icon = config.icon;

          return (
            <Card key={category} className="border-0 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="size-4 text-muted-foreground" />
                  {config.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {grouped[category].map((landmark) => (
                  <div
                    key={landmark._id}
                    className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">{landmark.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDistance(landmark.distance_km)}
                      {landmark.time_minutes !== undefined
                        ? ` • ${landmark.time_minutes} min`
                        : " • Time not available"}
                      {landmark.transport_mode ? ` • ${landmark.transport_mode}` : ""}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="size-3.5" />
        Travel times are indicative and may vary by traffic.
      </p>
    </div>
  );
}
