"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SortOption = "newest" | "price_asc" | "price_desc" | "area_desc" | "freshness_first";

export type ListingFilters = {
  search: string;
  bhk: string[];
  furnishing: string[];
  priceMin: number | null;
  priceMax: number | null;
  amenities: string[];
  availableNow: boolean;
  locality: string[];
  sort: SortOption;
};

const VALID_SORTS: SortOption[] = [
  "newest",
  "price_asc",
  "price_desc",
  "area_desc",
  "freshness_first",
];

function parseArrayParam(value: string | null): string[] {
  if (!value) return [];
  return value.split("|").filter(Boolean);
}

function parseNumberParam(value: string | null): number | null {
  if (!value) return null;
  const num = parseInt(value, 10);
  return Number.isNaN(num) ? null : num;
}

type BudgetRange = {
  priceMin: number | null;
  priceMax: number | null;
};

function parseBudgetAmount(value: string): number | null {
  const cleaned = value.trim().toLowerCase().replace(/₹/g, "").replace(/,/g, "");
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (Number.isNaN(amount)) return null;

  return Math.round(amount * (match[2] ? 1000 : 1));
}

function parseBudgetParam(value: string | null): BudgetRange {
  if (!value) return { priceMin: null, priceMax: null };

  const normalized = value.trim().toLowerCase();

  const rangeMatch = normalized.match(/^(.+)-(.+)$/);
  if (rangeMatch) {
    const min = parseBudgetAmount(rangeMatch[1]);
    const max = parseBudgetAmount(rangeMatch[2]);
    if (min !== null && max !== null) {
      return { priceMin: min, priceMax: max };
    }
  }

  if (normalized.startsWith("<")) {
    const max = parseBudgetAmount(normalized.slice(1));
    if (max !== null) {
      return { priceMin: null, priceMax: max };
    }
  }

  if (normalized.startsWith(">")) {
    const min = parseBudgetAmount(normalized.slice(1));
    if (min !== null) {
      return { priceMin: min, priceMax: null };
    }
  }

  if (normalized.startsWith("under-")) {
    const max = parseBudgetAmount(normalized.slice("under-".length));
    if (max !== null) {
      return { priceMin: null, priceMax: max };
    }
  }

  if (normalized.startsWith("above-")) {
    const min = parseBudgetAmount(normalized.slice("above-".length));
    if (min !== null) {
      return { priceMin: min, priceMax: null };
    }
  }

  return { priceMin: null, priceMax: null };
}

export type UseListingFiltersReturn = {
  filters: ListingFilters;
  setFilter: (key: keyof ListingFilters, value: unknown) => void;
  toggleArrayFilter: (key: "bhk" | "furnishing" | "amenities" | "locality", value: string) => void;
  clearAll: () => void;
  activeFilterCount: number;
};

export function useListingFilters(): UseListingFiltersReturn {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(
    searchParams.get("search") ?? searchParams.get("q") ?? "",
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef(searchInput);

  useEffect(() => {
    searchInputRef.current = searchInput;
  }, [searchInput]);

  const filters: ListingFilters = useMemo(() => {
    const budgetRange = parseBudgetParam(searchParams.get("budget"));
    const priceMin = parseNumberParam(searchParams.get("price_min"));
    const priceMax = parseNumberParam(searchParams.get("price_max"));

    return {
      search: searchParams.get("search") ?? searchParams.get("q") ?? "",
      bhk: parseArrayParam(searchParams.get("bhk") ?? searchParams.get("type")),
      furnishing: parseArrayParam(searchParams.get("furnishing")),
      priceMin: priceMin ?? budgetRange.priceMin,
      priceMax: priceMax ?? budgetRange.priceMax,
      amenities: parseArrayParam(searchParams.get("amenities")),
      availableNow: searchParams.get("available_now") === "true",
      locality: parseArrayParam(searchParams.get("locality")),
      sort: VALID_SORTS.includes(searchParams.get("sort") as SortOption)
        ? (searchParams.get("sort") as SortOption)
        : "newest",
    };
  }, [searchParams]);

  // Resync the local (debounced) search input when the URL's searchParams identity
  // changes externally (nav, back/forward, other filter updates) — adjusted directly
  // during render, matching React's "adjusting state when a prop changes" pattern,
  // since it only needs to run when searchParams actually changes, not every render.
  const [prevSearchParams, setPrevSearchParams] = useState(searchParams);
  if (searchParams !== prevSearchParams) {
    setPrevSearchParams(searchParams);
    setSearchInput(searchParams.get("search") ?? searchParams.get("q") ?? "");
  }

  const updateURL = useCallback(
    (newFilters: Partial<ListingFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...filters, ...newFilters };

      params.delete("q");
      params.delete("type");
      params.delete("budget");

      if (merged.search) params.set("search", merged.search);
      else params.delete("search");

      if (merged.bhk.length > 0) params.set("bhk", merged.bhk.join("|"));
      else params.delete("bhk");

      if (merged.furnishing.length > 0) params.set("furnishing", merged.furnishing.join("|"));
      else params.delete("furnishing");

      if (merged.priceMin !== null) params.set("price_min", String(merged.priceMin));
      else params.delete("price_min");

      if (merged.priceMax !== null) params.set("price_max", String(merged.priceMax));
      else params.delete("price_max");

      if (merged.amenities.length > 0) params.set("amenities", merged.amenities.join("|"));
      else params.delete("amenities");

      if (merged.availableNow) params.set("available_now", "true");
      else params.delete("available_now");

      if (merged.locality.length > 0) params.set("locality", merged.locality.join("|"));
      else params.delete("locality");

      if (merged.sort !== "newest") params.set("sort", merged.sort);
      else params.delete("sort");

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, filters, pathname, router],
  );

  const setFilter = useCallback(
    (key: keyof ListingFilters, value: unknown) => {
      if (key === "search") {
        const searchVal = String(value);
        setSearchInput(searchVal);
        searchInputRef.current = searchVal;
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
          const params = new URLSearchParams(window.location.search);
          if (searchInputRef.current) params.set("search", searchInputRef.current);
          else params.delete("search");
          params.delete("q");
          const qs = params.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }, 300);
        return;
      }
      updateURL({ [key]: value } as Partial<ListingFilters>);
    },
    [pathname, router, updateURL],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const toggleArrayFilter = useCallback(
    (key: "bhk" | "furnishing" | "amenities" | "locality", value: string) => {
      const current = filters[key];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      updateURL({ [key]: next } as Partial<ListingFilters>);
    },
    [filters, updateURL],
  );

  const clearAll = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setSearchInput("");
    searchInputRef.current = "";
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.bhk.length > 0) count += 1;
    if (filters.furnishing.length > 0) count += 1;
    if (filters.priceMin !== null || filters.priceMax !== null) count += 1;
    if (filters.amenities.length > 0) count += 1;
    if (filters.availableNow) count += 1;
    if (filters.locality.length > 0) count += 1;
    return count;
  }, [filters]);

  return {
    filters: { ...filters, search: searchInput },
    setFilter,
    toggleArrayFilter,
    clearAll,
    activeFilterCount,
  };
}
