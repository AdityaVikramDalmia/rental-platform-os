"use client";

import { X } from "lucide-react";
import type { ListingFilters } from "@/lib/hooks/use-listing-filters";
import { getAmenityLabel } from "@/lib/amenity-icons";
import { formatINR } from "../../../../lib/money";
import { Button } from "@/components/ui/button";

const FURNISHING_LABELS: Record<string, string> = {
  UNFURNISHED: "Unfurnished",
  SEMI_FURNISHED: "Semi-Furnished",
  FULLY_FURNISHED: "Fully Furnished",
};

type ActiveFilterChipsProps = {
  filters: ListingFilters;
  onRemoveBhk: (value: string) => void;
  onRemoveFurnishing: (value: string) => void;
  onRemoveAmenity: (value: string) => void;
  onRemoveLocality: (value: string) => void;
  onRemovePrice: () => void;
  onRemoveAvailableNow: () => void;
  onClearAll: () => void;
  activeFilterCount: number;
};

export function ActiveFilterChips({
  filters,
  onRemoveBhk,
  onRemoveFurnishing,
  onRemoveAmenity,
  onRemoveLocality,
  onRemovePrice,
  onRemoveAvailableNow,
  onClearAll,
  activeFilterCount,
}: ActiveFilterChipsProps) {
  if (activeFilterCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.bhk.map((bhk) => (
        <FilterChip key={`bhk-${bhk}`} label={bhk} onRemove={() => onRemoveBhk(bhk)} />
      ))}

      {filters.furnishing.map((f) => (
        <FilterChip
          key={`furnishing-${f}`}
          label={FURNISHING_LABELS[f] ?? f}
          onRemove={() => onRemoveFurnishing(f)}
        />
      ))}

      {(filters.priceMin !== null || filters.priceMax !== null) && (
        <FilterChip
          label={formatPriceChip(filters.priceMin, filters.priceMax)}
          onRemove={onRemovePrice}
        />
      )}

      {filters.amenities.map((a) => (
        <FilterChip
          key={`amenity-${a}`}
          label={getAmenityLabel(a)}
          onRemove={() => onRemoveAmenity(a)}
        />
      ))}

      {filters.locality.map((loc) => (
        <FilterChip key={`locality-${loc}`} label={loc} onRemove={() => onRemoveLocality(loc)} />
      ))}

      {filters.availableNow && <FilterChip label="Available Now" onRemove={onRemoveAvailableNow} />}

      <Button
        variant="ghost"
        size="sm"
        onClick={onClearAll}
        className="h-7 rounded-full text-xs text-slate-500 hover:text-red-600"
      >
        Clear All
      </Button>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 py-1 pl-3 pr-1.5 text-xs font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex size-4 items-center justify-center rounded-full text-blue-400 transition-colors hover:bg-blue-200 hover:text-blue-700"
        aria-label={`Remove ${label} filter`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

function formatPriceChip(min: number | null, max: number | null): string {
  if (min !== null && max !== null) {
    return `${formatINR(min)} – ${formatINR(max)}`;
  }
  if (min !== null) return `From ${formatINR(min)}`;
  if (max !== null) return `Up to ${formatINR(max)}`;
  return "Price";
}
