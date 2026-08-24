"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { PropertyCard } from "@/components/public/listings/property-card";
import { useFavorites } from "@/lib/hooks/use-favorites";
import { Skeleton } from "@/components/ui/skeleton";

type SimilarListingsProps = {
  listingId: string;
  bhk_config: string;
  society_name: string | null;
};

const SKELETON_KEYS = ["one", "two", "three"] as const;

export function SimilarListings({ listingId, bhk_config, society_name }: SimilarListingsProps) {
  const similar = useQuery(api.listings.getSimilarListings, {
    listing_id: listingId as Id<"listings">,
    bhk_config,
    society_name: society_name ?? undefined,
  });

  const { isFavorite, toggleFavorite } = useFavorites();

  if (similar === undefined) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Similar Properties</h2>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {SKELETON_KEYS.map((key) => (
            <div key={`skeleton-${key}`} className="min-w-[280px] max-w-[320px] shrink-0">
              <Skeleton className="h-52 w-full rounded-lg" />
              <Skeleton className="mt-3 h-4 w-3/4" />
              <Skeleton className="mt-2 h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!similar || similar.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Similar Properties</h2>
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory">
        {similar.map((listing) => (
          <div key={listing._id} className="min-w-[280px] max-w-[320px] shrink-0 snap-start">
            <PropertyCard
              listing={listing}
              isFavorite={isFavorite(listing._id)}
              action={toggleFavorite}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
