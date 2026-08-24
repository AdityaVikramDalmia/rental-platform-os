"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Home, Loader2, Search, SearchX, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { USER_TYPE } from "../../../../lib/constants";
import { useListingFilters } from "@/lib/hooks/use-listing-filters";
import type { ListingFilters, SortOption } from "@/lib/hooks/use-listing-filters";
import { useFavorites } from "@/lib/hooks/use-favorites";
import { useViewMode } from "@/lib/hooks/use-view-mode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { BlurFade } from "@/components/ui/blur-fade";
import { cn } from "@/lib/utils";
import { ActiveFilterChips } from "./active-filter-chips";
import { FilterSidebar } from "./filter-sidebar";
import { PropertyCard } from "./property-card";
import { PropertyListItem } from "./property-list-item";
import { SearchBar } from "./search-bar";
import { SortDropdown } from "./sort-dropdown";
import { ViewToggle } from "./view-toggle";

const ITEMS_PER_PAGE = 20;

const QUICK_CHIPS = [
  { label: "1 BHK", key: "bhk", value: "1BHK" },
  { label: "2 BHK", key: "bhk", value: "2BHK" },
  { label: "3 BHK", key: "bhk", value: "3BHK" },
  { label: "Furnished", key: "furnishing", value: "FULLY_FURNISHED" },
  { label: "Available Now", key: "availableNow", value: "true" },
] as const;

type PublishedListing = NonNullable<
  ReturnType<typeof useQuery<typeof api.listings.listPublished>>
>[number];

function applyFilters(listings: PublishedListing[], filters: ListingFilters): PublishedListing[] {
  return listings.filter((listing) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const searchable = [
        listing.society_name,
        listing.building_name,
        listing.city,
        listing.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    if (filters.bhk.length > 0 && !filters.bhk.includes(listing.bhk_config)) return false;
    if (filters.furnishing.length > 0 && !filters.furnishing.includes(listing.furnishing))
      return false;
    if (filters.priceMin !== null && listing.rent_monthly < filters.priceMin) return false;
    if (filters.priceMax !== null && listing.rent_monthly > filters.priceMax) return false;
    if (filters.amenities.length > 0) {
      const set: Set<string> = new Set(listing.amenities ?? []);
      if (!filters.amenities.every((a) => set.has(a))) return false;
    }
    if (filters.availableNow && listing.available_from > Date.now()) return false;
    if (filters.locality.length > 0 && !filters.locality.includes(listing.society_name ?? ""))
      return false;
    return true;
  });
}

function applySortOrder(listings: PublishedListing[], sort: SortOption): PublishedListing[] {
  const sorted = [...listings];
  switch (String(sort)) {
    case "newest":
      return sorted.sort((a, b) => b._creationTime - a._creationTime);
    case "freshness_first":
      return sorted.sort((a, b) => {
        const leftScore = a.trust?.freshness_score ?? 0;
        const rightScore = b.trust?.freshness_score ?? 0;
        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }

        return b._creationTime - a._creationTime;
      });
    case "price_asc":
      return sorted.sort((a, b) => a.rent_monthly - b.rent_monthly);
    case "price_desc":
      return sorted.sort((a, b) => b.rent_monthly - a.rent_monthly);
    case "area_desc":
      return sorted.sort((a, b) => (b.carpet_area_sqft ?? 0) - (a.carpet_area_sqft ?? 0));
    default:
      return sorted;
  }
}

function isQuickChipActive(chip: (typeof QUICK_CHIPS)[number], filters: ListingFilters): boolean {
  if (chip.key === "bhk") return filters.bhk.includes(chip.value);
  if (chip.key === "furnishing") return filters.furnishing.includes(chip.value);
  if (chip.key === "availableNow") return filters.availableNow;
  return false;
}

export function ListingsDirectory() {
  const { filters, setFilter, toggleArrayFilter, clearAll, activeFilterCount } =
    useListingFilters();
  const allListings = useQuery(api.listings.listPublished, {
    sort_by: String(filters.sort) === "freshness_first" ? "freshness_first" : undefined,
  });
  const { isFavorite, toggleFavorite } = useFavorites();
  const currentUser = useQuery(api.users.getCurrentUser);
  const addTenantFavorite = useMutation(api.tenantFavorites.add);
  const removeTenantFavorite = useMutation(api.tenantFavorites.remove);
  const { viewMode, setViewMode } = useViewMode();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const filtersKey = `${filters.search}|${filters.bhk.join(",")}|${filters.furnishing.join(",")}|${filters.priceMin}|${filters.priceMax}|${filters.amenities.join(",")}|${filters.availableNow}|${filters.locality.join(",")}|${filters.sort}`;

  // Reset pagination whenever the filters change, mirroring the previous effect's
  // dependency array. Adjusting state during render (rather than in an effect) avoids a
  // stale-content flash between the filters changing and an effect resetting the page.
  // See https://react.dev/learn/you-might-not-need-an-effect
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey);
  if (filtersKey !== prevFiltersKey) {
    setPrevFiltersKey(filtersKey);
    setVisibleCount(ITEMS_PER_PAGE);
  }

  const filterOptions = useMemo(() => {
    if (!allListings) return null;
    const localities = [
      ...new Set(allListings.map((l) => l.society_name).filter(Boolean)),
    ].sort() as string[];
    const bhkConfigs = [...new Set(allListings.map((l) => l.bhk_config))].sort();
    const furnishingTypes = [...new Set(allListings.map((l) => l.furnishing))];
    const allAmenities = [...new Set(allListings.flatMap((l) => l.amenities ?? []))].sort();
    const prices = allListings.map((l) => l.rent_monthly);
    const priceMin = prices.length > 0 ? Math.min(...prices) : 0;
    const priceMax = prices.length > 0 ? Math.max(...prices) : 10000000;
    return {
      localities,
      bhkConfigs,
      furnishingTypes,
      allAmenities,
      priceMin,
      priceMax,
    };
  }, [allListings]);

  const filtered = useMemo(
    () => (allListings ? applyFilters(allListings, filters) : []),
    [allListings, filters],
  );
  const sorted = useMemo(() => applySortOrder(filtered, filters.sort), [filtered, filters.sort]);
  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;
  const hasSearchQuery = filters.search.trim().length > 0;
  const hasActiveFilters = activeFilterCount > 0;
  const isTenantUser =
    currentUser?.user_types?.includes(USER_TYPE.TENANT) ??
    currentUser?.user_type === USER_TYPE.TENANT;

  const handleToggleFavorite = useCallback(
    async (listingId: string) => {
      const listing_id = listingId as Id<"listings">;
      const wasFavorite = isFavorite(listingId);

      toggleFavorite(listingId);

      if (!isTenantUser) {
        return;
      }

      try {
        if (wasFavorite) {
          await removeTenantFavorite({ listing_id });
        } else {
          await addTenantFavorite({ listing_id });
        }
      } catch {
        toggleFavorite(listingId);
      }
    },
    [addTenantFavorite, isFavorite, isTenantUser, removeTenantFavorite, toggleFavorite],
  );

  const handleQuickChip = useCallback(
    (chip: (typeof QUICK_CHIPS)[number]) => {
      if (chip.key === "bhk") {
        toggleArrayFilter("bhk", chip.value);
      } else if (chip.key === "furnishing") {
        toggleArrayFilter("furnishing", chip.value);
      } else if (chip.key === "availableNow") {
        setFilter("availableNow", !filters.availableNow);
      }
    },
    [toggleArrayFilter, setFilter, filters.availableNow],
  );

  if (allListings === undefined) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-gradient-to-b from-slate-900 to-slate-800 px-4 pb-10 pt-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl space-y-4 text-center">
            <Skeleton className="mx-auto h-8 w-64 bg-white/10" />
            <Skeleton className="mx-auto h-14 w-full rounded-2xl bg-white/10" />
            <div className="flex justify-center gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton
                  key={`chip-skel-${String(i)}`}
                  className="h-8 w-20 rounded-full bg-white/10"
                />
              ))}
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex gap-6">
            <div className="hidden w-72 shrink-0 space-y-3 lg:block">
              <Skeleton className="h-[400px] w-full rounded-xl" />
            </div>
            <div className="flex-1">
              <Skeleton className="mb-6 h-9 w-full rounded-lg" />
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={`card-skel-${String(i)}`}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <Skeleton className="h-56 w-full" />
                    <div className="space-y-3 p-4">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-8 w-full rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <BlurFade delay={0} inView>
        <section className="relative overflow-hidden bg-gradient-to-b from-slate-900 to-slate-800">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(96,165,250,0.08)_0%,transparent_60%)]" />
          <div className="relative z-10 mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mb-1 flex items-center justify-center gap-2 text-sm font-medium text-blue-400">
                <Search className="size-4" />
                <span className="uppercase tracking-widest">Browse Properties</span>
              </div>
              <h1 className="mb-6 bg-gradient-to-r from-white via-blue-100 to-blue-300 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
                Find Your Perfect Rental
              </h1>

              <SearchBar
                value={filters.search}
                onChange={(v) => setFilter("search", v)}
                onClear={() => setFilter("search", "")}
                variant="hero"
                className="mx-auto"
              />

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {QUICK_CHIPS.map((chip) => {
                  const active = isQuickChipActive(chip, filters);
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => handleQuickChip(chip)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200",
                        active
                          ? "border-blue-400 bg-blue-500/20 text-blue-300"
                          : "border-white/15 bg-white/5 text-slate-300 hover:border-white/30 hover:bg-white/10",
                      )}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              {allListings && (
                <p className="mt-4 text-sm text-slate-400">
                  <span className="font-semibold text-white">{filtered.length}</span>{" "}
                  {filtered.length === 1 ? "property" : "properties"} found
                  {filters.search && (
                    <span>
                      {" "}
                      for <span className="text-blue-400">&ldquo;{filters.search}&rdquo;</span>
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        </section>
      </BlurFade>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg border-slate-200 bg-white shadow-sm lg:hidden"
                >
                  <SlidersHorizontal className="mr-2 size-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge className="ml-2 size-5 justify-center rounded-full bg-blue-600 p-0 text-[10px] text-white">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                {filterOptions && (
                  <div className="mt-4 px-1">
                    <FilterSidebar
                      filterOptions={filterOptions}
                      filters={filters}
                      toggleArrayFilter={toggleArrayFilter}
                      setFilter={setFilter}
                      clearAll={() => {
                        clearAll();
                        setSheetOpen(false);
                      }}
                    />
                  </div>
                )}
              </SheetContent>
            </Sheet>

            <p className="hidden text-sm font-medium text-slate-700 sm:block">
              {filtered.length} {filtered.length === 1 ? "result" : "results"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <SortDropdown sort={filters.sort} onSortChange={(v) => setFilter("sort", v)} />
            <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="mb-4">
            <ActiveFilterChips
              filters={filters}
              onRemoveBhk={(v) => toggleArrayFilter("bhk", v)}
              onRemoveFurnishing={(v) => toggleArrayFilter("furnishing", v)}
              onRemoveAmenity={(v) => toggleArrayFilter("amenities", v)}
              onRemoveLocality={(v) => toggleArrayFilter("locality", v)}
              onRemovePrice={() => {
                setFilter("priceMin", null);
                setFilter("priceMax", null);
              }}
              onRemoveAvailableNow={() => setFilter("availableNow", false)}
              onClearAll={clearAll}
              activeFilterCount={activeFilterCount}
            />
          </div>
        )}

        <div className="flex gap-6">
          {filterOptions && (
            <aside className="sticky top-20 hidden h-fit w-72 shrink-0 lg:block">
              <FilterSidebar
                filterOptions={filterOptions}
                filters={filters}
                toggleArrayFilter={toggleArrayFilter}
                setFilter={setFilter}
                clearAll={clearAll}
              />
            </aside>
          )}

          <div className="min-w-0 flex-1">
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((listing, i) => (
                  <BlurFade key={listing._id} delay={0.05 * Math.min(i, 8)} inView>
                    <PropertyCard
                      listing={listing}
                      isFavorite={isFavorite(listing._id)}
                      action={(listingId) => {
                        void handleToggleFavorite(listingId);
                      }}
                    />
                  </BlurFade>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {visible.map((listing, i) => (
                  <BlurFade key={listing._id} delay={0.04 * Math.min(i, 8)} inView>
                    <PropertyListItem
                      listing={listing}
                      isFavorite={isFavorite(listing._id)}
                      action={(listingId) => {
                        void handleToggleFavorite(listingId);
                      }}
                    />
                  </BlurFade>
                ))}
              </div>
            )}

            {hasMore && (
              <div className="mt-8 flex flex-col items-center gap-2">
                <p className="text-xs text-slate-500">
                  Showing {visible.length} of {sorted.length}
                </p>
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount((c) => c + ITEMS_PER_PAGE)}
                  className="rounded-xl border-slate-200 px-8 shadow-sm hover:bg-slate-50"
                >
                  <Loader2 className="mr-2 size-4 animate-none" />
                  Load More
                </Button>
              </div>
            )}

            {filtered.length === 0 && allListings && allListings.length > 0 && (
              <div className="flex flex-col items-center gap-5 rounded-2xl border-2 border-dashed border-slate-200 bg-white py-20 text-center">
                <div className="inline-flex size-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <SearchX className="size-8" />
                </div>
                <div className="space-y-1">
                  {hasSearchQuery ? (
                    <p className="text-base font-semibold text-slate-800">
                      No listings found for &apos;{filters.search}&apos;
                    </p>
                  ) : (
                    <p className="text-base font-semibold text-slate-800">
                      No listings match your filters
                    </p>
                  )}
                  <p className="text-sm text-slate-500">Try adjusting your search or filters</p>
                </div>
                {hasSearchQuery ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setFilter("search", "")}
                  >
                    Clear Search
                  </Button>
                ) : (
                  hasActiveFilters && (
                    <Button variant="outline" size="sm" className="rounded-lg" onClick={clearAll}>
                      Clear All Filters
                    </Button>
                  )
                )}
              </div>
            )}

            {allListings && allListings.length === 0 && (
              <div className="flex flex-col items-center gap-5 rounded-2xl border-2 border-dashed border-slate-200 bg-white py-20 text-center">
                <div className="inline-flex size-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Home className="size-8" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-slate-800">
                    New listings coming soon!
                  </p>
                  <p className="text-sm text-slate-500">
                    We&apos;re adding verified properties every day
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild size="sm" className="rounded-lg bg-blue-600 hover:bg-blue-700">
                    <Link href="/homepage">View Homepage</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="rounded-lg">
                    <Link href="/contact">Contact Us</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
