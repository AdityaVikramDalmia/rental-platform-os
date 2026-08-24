"use client";

import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import type { ListingFilters } from "@/lib/hooks/use-listing-filters";
import { getAmenityIcon, getAmenityLabel } from "@/lib/amenity-icons";
import { formatINR } from "../../../../lib/money";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type FilterOptions = {
  localities: string[];
  bhkConfigs: string[];
  furnishingTypes: string[];
  allAmenities: string[];
  priceMin: number;
  priceMax: number;
};

const FURNISHING_LABELS: Record<string, string> = {
  UNFURNISHED: "Unfurnished",
  SEMI_FURNISHED: "Semi-Furnished",
  FULLY_FURNISHED: "Fully Furnished",
};

type FilterSidebarProps = {
  filterOptions: FilterOptions;
  filters: ListingFilters;
  toggleArrayFilter: (key: "bhk" | "furnishing" | "amenities" | "locality", value: string) => void;
  setFilter: (key: keyof ListingFilters, value: unknown) => void;
  clearAll: () => void;
};

const DEFAULT_AMENITY_SHOW = 8;

function FilterSectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <span className="flex items-center gap-2">
      {label}
      {count !== undefined && count > 0 && (
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">
          {count}
        </span>
      )}
    </span>
  );
}

export function FilterSidebar({
  filterOptions,
  filters,
  toggleArrayFilter,
  setFilter,
  clearAll,
}: FilterSidebarProps) {
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const visibleAmenities = showAllAmenities
    ? filterOptions.allAmenities
    : filterOptions.allAmenities.slice(0, DEFAULT_AMENITY_SHOW);

  const currentMin = filters.priceMin ?? filterOptions.priceMin;
  const currentMax = filters.priceMax ?? filterOptions.priceMax;

  const hasActiveFilters =
    filters.bhk.length > 0 ||
    filters.furnishing.length > 0 ||
    filters.amenities.length > 0 ||
    filters.locality.length > 0 ||
    filters.priceMin !== null ||
    filters.priceMax !== null ||
    filters.availableNow;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Filters</h3>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-red-600"
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
        )}
      </div>

      <Accordion
        type="multiple"
        defaultValue={["locality", "bhk", "price", "furnishing", "amenities", "availability"]}
        className="space-y-0"
      >
        {filterOptions.localities.length > 0 && (
          <AccordionItem value="locality" className="border-b border-slate-100 last:border-b-0">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:no-underline">
              <FilterSectionHeader label="Society" count={filters.locality.length} />
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <div className="max-h-36 space-y-2.5 overflow-y-auto pr-1">
                {filterOptions.localities.map((loc) => (
                  <Label
                    key={loc}
                    htmlFor={`locality-${loc}`}
                    className="flex cursor-pointer items-center gap-2.5 text-sm font-normal text-slate-700 transition-colors hover:text-slate-900"
                  >
                    <Checkbox
                      id={`locality-${loc}`}
                      checked={filters.locality.includes(loc)}
                      onCheckedChange={() => toggleArrayFilter("locality", loc)}
                      className="rounded"
                    />
                    {loc}
                  </Label>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="bhk" className="border-b border-slate-100 last:border-b-0">
          <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:no-underline">
            <FilterSectionHeader label="Property Type" count={filters.bhk.length} />
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="flex flex-wrap gap-2">
              {filterOptions.bhkConfigs.map((bhk) => (
                <button
                  key={bhk}
                  type="button"
                  onClick={() => toggleArrayFilter("bhk", bhk)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200",
                    filters.bhk.includes(bhk)
                      ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-200"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50",
                  )}
                >
                  {bhk}
                </button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="price" className="border-b border-slate-100 last:border-b-0">
          <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:no-underline">
            <FilterSectionHeader
              label="Price Range"
              count={filters.priceMin !== null || filters.priceMax !== null ? 1 : 0}
            />
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4 px-0.5">
              <Slider
                value={[currentMin, currentMax]}
                onValueChange={([min, max]) => {
                  setFilter("priceMin", min === filterOptions.priceMin ? null : min);
                  setFilter("priceMax", max === filterOptions.priceMax ? null : max);
                }}
                min={filterOptions.priceMin}
                max={filterOptions.priceMax}
                step={100000}
              />
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label
                    htmlFor="price-filter-min"
                    className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-400"
                  >
                    Min
                  </Label>
                  <Input
                    id="price-filter-min"
                    type="text"
                    value={formatINR(currentMin)}
                    readOnly
                    className="h-8 rounded-lg bg-slate-50 text-center text-xs"
                  />
                </div>
                <span className="mt-4 text-xs text-slate-300">—</span>
                <div className="flex-1">
                  <Label
                    htmlFor="price-filter-max"
                    className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-400"
                  >
                    Max
                  </Label>
                  <Input
                    id="price-filter-max"
                    type="text"
                    value={formatINR(currentMax)}
                    readOnly
                    className="h-8 rounded-lg bg-slate-50 text-center text-xs"
                  />
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="furnishing" className="border-b border-slate-100 last:border-b-0">
          <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:no-underline">
            <FilterSectionHeader label="Furnishing" count={filters.furnishing.length} />
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="flex flex-wrap gap-2">
              {filterOptions.furnishingTypes.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleArrayFilter("furnishing", f)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200",
                    filters.furnishing.includes(f)
                      ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-200"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50",
                  )}
                >
                  {FURNISHING_LABELS[f] ?? f}
                </button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="amenities" className="border-b border-slate-100 last:border-b-0">
          <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:no-underline">
            <FilterSectionHeader label="Amenities" count={filters.amenities.length} />
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-2.5">
              {visibleAmenities.map((amenity) => {
                const Icon = getAmenityIcon(amenity);
                return (
                  <Label
                    key={amenity}
                    htmlFor={`amenity-${amenity}`}
                    className="flex cursor-pointer items-center gap-2.5 text-sm font-normal text-slate-700 transition-colors hover:text-slate-900"
                  >
                    <Checkbox
                      id={`amenity-${amenity}`}
                      checked={filters.amenities.includes(amenity)}
                      onCheckedChange={() => toggleArrayFilter("amenities", amenity)}
                      className="rounded"
                    />
                    <Icon className="size-3.5 text-slate-400" />
                    {getAmenityLabel(amenity)}
                  </Label>
                );
              })}
              {filterOptions.allAmenities.length > DEFAULT_AMENITY_SHOW && (
                <button
                  type="button"
                  onClick={() => setShowAllAmenities((p) => !p)}
                  className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      showAllAmenities && "rotate-180",
                    )}
                  />
                  {showAllAmenities
                    ? "Show less"
                    : `Show all (${filterOptions.allAmenities.length})`}
                </button>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="availability" className="border-b-0">
          <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:no-underline">
            <FilterSectionHeader label="Availability" count={filters.availableNow ? 1 : 0} />
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <Label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700 transition-colors hover:text-slate-900">
              <Checkbox
                checked={filters.availableNow}
                onCheckedChange={(checked) => setFilter("availableNow", !!checked)}
                className="rounded"
              />
              Available Now
            </Label>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {hasActiveFilters && (
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          className="w-full rounded-lg border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        >
          <RotateCcw className="mr-1.5 size-3" />
          Clear All Filters
        </Button>
      )}
    </div>
  );
}
