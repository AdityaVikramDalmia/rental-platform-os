"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { PropertyListItem } from "@/components/public/listings/property-list-item";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFavorites } from "@/lib/hooks/use-favorites";

type FavoriteRow = {
  favorite_id: Id<"tenant_favorites">;
  listing_id: Id<"listings">;
  listing: {
    _id: Id<"listings">;
    slug: string;
    bhk_config: string;
    rent_monthly: number;
    furnishing: string;
    floor_number: string;
    carpet_area_sqft?: number;
    available_from: number;
    flat_number: string | null;
    building_name: string | null;
    society_name: string | null;
    city: string | null;
    first_photo_url: string | null;
    amenities?: string[];
    trust?: {
      badges: Array<{
        type: string;
        earned: boolean;
        timestamp?: number;
        count?: number;
      }>;
      freshness_score: number;
      freshness_state: string;
      last_activity_at?: number;
      evidence?: {
        photo_count?: number;
        visit_count?: number;
        has_closure?: boolean;
      };
    } | null;
  };
};

export default function TenantFavoritesPage() {
  const favorites = useQuery(api.tenantFavorites.list, {});
  const removeFavorite = useMutation(api.tenantFavorites.remove);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const { isFavorite, toggleFavorite } = useFavorites();

  const handleRemove = async (listingId: string) => {
    const id = listingId as Id<"listings">;
    setRemovingIds((prev) => new Set(prev).add(listingId));

    try {
      await removeFavorite({ listing_id: id });
      if (isFavorite(listingId)) {
        toggleFavorite(listingId);
      }
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(listingId);
        return next;
      });
    }
  };

  if (favorites === undefined) {
    return (
      <div className="space-y-4 pb-8">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={`favorites-skeleton-${String(index)}`} className="border-slate-200">
              <CardContent className="p-4">
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const rows = favorites as FavoriteRow[];

  return (
    <div className="space-y-5 pb-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Favorites</h1>
        <p className="text-sm text-slate-600">
          Your saved listings are synced across sessions and devices.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="space-y-3 py-10 text-center">
            <p className="text-base font-semibold text-slate-900">No favorites yet</p>
            <p className="text-sm text-slate-600">
              Tap the heart icon on a listing to save it for quick access.
            </p>
            <Button asChild className="bg-cyan-600 text-white hover:bg-cyan-700">
              <Link href="/listings">Browse listings</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((favorite) => {
            const isRemoving = removingIds.has(String(favorite.listing_id));

            return (
              <div key={String(favorite.favorite_id)} className={isRemoving ? "opacity-60" : ""}>
                <PropertyListItem
                  listing={favorite.listing}
                  isFavorite={true}
                  action={(listingId) => {
                    if (isRemoving) {
                      return;
                    }
                    void handleRemove(listingId);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
