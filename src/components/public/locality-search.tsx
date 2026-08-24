"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LOCALITY_OPTIONS = ["Any", "HSR Layout", "Koramangala", "Whitefield", "Indiranagar"];
const PROPERTY_TYPES = ["Any", "1RK", "1BHK", "2BHK", "3BHK"];
const BUDGET_OPTIONS = ["Any", "<25000", "25000-40000", "40000-60000", ">60000"];

const QUICK_SEARCHES = [
  { label: "Under \u20B920k", field: "budget" as const, value: "<25000" },
  { label: "2 BHK", field: "propertyType" as const, value: "2BHK" },
  { label: "HSR Layout", field: "locality" as const, value: "HSR Layout" },
  { label: "Koramangala", field: "locality" as const, value: "Koramangala" },
  { label: "Near Metro", field: "query" as const, value: "metro" },
];

export function LocalitySearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [locality, setLocality] = useState("Any");
  const [propertyType, setPropertyType] = useState("Any");
  const [budget, setBudget] = useState("Any");

  const handleSearch = () => {
    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (locality !== "Any") {
      params.set("locality", locality);
    }

    if (propertyType !== "Any") {
      params.set("type", propertyType);
    }

    if (budget !== "Any") {
      params.set("budget", budget);
    }

    const queryString = params.toString();
    const target = queryString ? `/listings?${queryString}` : "/listings";
    router.push(target);
  };

  const handleQuickSearch = (chip: (typeof QUICK_SEARCHES)[number]) => {
    const params = new URLSearchParams();

    switch (chip.field) {
      case "budget":
        setBudget(chip.value);
        params.set("budget", chip.value);
        break;
      case "propertyType":
        setPropertyType(chip.value);
        params.set("type", chip.value);
        break;
      case "locality":
        setLocality(chip.value);
        params.set("locality", chip.value);
        break;
      case "query":
        setQuery(chip.value);
        params.set("q", chip.value);
        break;
    }

    const queryString = params.toString();
    router.push(queryString ? `/listings?${queryString}` : "/listings");
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "rounded-2xl p-6 sm:p-8",
          "bg-white/70 backdrop-blur-xl border border-white/20 shadow-2xl",
          "has-[:focus-visible]:shadow-blue-200/50 has-[:focus-visible]:border-blue-200",
          "transition-all duration-300",
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by area or landmark"
              className="h-12 rounded-xl pl-10"
              aria-label="Search properties"
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSearch();
              }}
            />
          </div>

          <Select value={locality} onValueChange={setLocality}>
            <SelectTrigger className="h-12 w-full rounded-xl" aria-label="Select locality">
              <SelectValue placeholder="Locality" />
            </SelectTrigger>
            <SelectContent>
              {LOCALITY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={propertyType} onValueChange={setPropertyType}>
            <SelectTrigger className="h-12 w-full rounded-xl" aria-label="Select property type">
              <SelectValue placeholder="Property type" />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={budget} onValueChange={setBudget}>
            <SelectTrigger className="h-12 w-full rounded-xl" aria-label="Select budget range">
              <SelectValue placeholder="Budget" />
            </SelectTrigger>
            <SelectContent>
              {BUDGET_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            size="lg"
            onClick={handleSearch}
            className="h-12 w-full rounded-xl bg-blue-600 px-8 hover:bg-blue-700 sm:w-auto"
          >
            <Search className="mr-2 size-4" />
            Search Listings
          </Button>
        </div>
      </div>

      {/* Quick filter chips */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs font-medium text-slate-400">Popular:</span>
        {QUICK_SEARCHES.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => handleQuickSearch(chip)}
            className="cursor-pointer rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
