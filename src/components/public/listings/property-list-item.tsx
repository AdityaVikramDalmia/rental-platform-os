"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BedDouble,
  Calendar,
  ImageOff,
  MapPin,
  MessageCircle,
  Ruler,
  ShowerHead,
} from "lucide-react";
import { formatINR } from "../../../../lib/money";
import { getAmenityIcon, getAmenityLabel } from "@/lib/amenity-icons";
import { Button } from "@/components/ui/button";
import { TrustBadgeChip } from "@/components/shared/trust-badge-chip";
import { FavoriteButton } from "./favorite-button";

const FURNISHING_LABELS: Record<string, string> = {
  UNFURNISHED: "Unfurnished",
  SEMI_FURNISHED: "Semi-Furnished",
  FULLY_FURNISHED: "Fully Furnished",
};

function normalizeListingPhotoUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname === "127.0.0.1") {
      parsed.hostname = "localhost";
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}

type PropertyListItemListing = {
  _id: string;
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

type PropertyListItemProps = {
  listing: PropertyListItemListing;
  isFavorite: boolean;
  action: (id: string) => void;
};

function extractBhkNumber(bhk: string): string | null {
  const match = bhk.match(/^(\d)/);
  return match ? match[1] : null;
}

export function PropertyListItem({ listing, isFavorite, action }: PropertyListItemProps) {
  const router = useRouter();
  const whatsappPhone = process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE ?? "";
  const coverPhotoUrl = normalizeListingPhotoUrl(listing.first_photo_url);
  const listingHref = `/listing/${listing.slug}`;
  const title = `${listing.building_name ?? "Building"}, Fl ${listing.floor_number}${listing.flat_number ? `, #${listing.flat_number}` : ""}`;
  const location = `${listing.society_name ?? "Society"}${listing.city ? `, ${listing.city}` : ""}`;
  const topAmenities = (listing.amenities ?? []).slice(0, 6);
  const [now] = useState(() => Date.now());
  const isAvailableNow = listing.available_from <= now;
  const building = listing.building_name ?? "Building";
  const flat = listing.flat_number ?? "Flat";
  const locality = listing.society_name ?? listing.city ?? "locality";
  const bhkNum = extractBhkNumber(listing.bhk_config);

  const whatsappMessage = `Hi, I'm interested in ${building} ${flat} at ${locality}`;
  const whatsappUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  return (
    <article
      className="group cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:shadow-lg focus-within:ring-2 focus-within:ring-blue-500"
      onClick={() => router.push(listingHref)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(listingHref);
        }
      }}
    >
      <div className="flex flex-col md:flex-row">
        <div className="relative h-52 w-full shrink-0 overflow-hidden bg-slate-100 md:h-auto md:w-56">
          {coverPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Uses signed Convex storage URLs for listing list media.
            <img
              src={coverPhotoUrl}
              alt={`${listing.bhk_config} at ${listing.society_name ?? "DemoRentals listing"}`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
              <div className="flex flex-col items-center gap-1 text-xs">
                <ImageOff className="size-6" />
                No photo
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-transparent" />

          <span className="absolute left-3 top-3 rounded-lg bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white shadow-lg">
            {listing.bhk_config}
          </span>

          <FavoriteButton
            listingId={listing._id}
            isFavorite={isFavorite}
            onToggle={action}
            className="absolute right-3 top-3"
          />
        </div>

        <div className="flex flex-1 flex-col justify-between gap-3 p-4 md:p-5">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 transition-colors group-hover:text-blue-600">
                  {title}
                </h3>
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="size-3.5 text-slate-400" />
                  {location}
                </p>
              </div>
              <p className="text-xl font-bold text-slate-900">
                {formatINR(listing.rent_monthly)}
                <span className="text-xs font-normal text-slate-500">/mo</span>
              </p>
            </div>

            <div className="min-h-[24px]">
              <TrustBadgeChip badges={listing.trust?.badges} maxBadges={4} />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              {bhkNum && (
                <span className="inline-flex items-center gap-1">
                  <BedDouble className="size-3.5 text-slate-400" />
                  {bhkNum} Bed
                </span>
              )}
              {bhkNum && (
                <span className="inline-flex items-center gap-1">
                  <ShowerHead className="size-3.5 text-slate-400" />
                  {bhkNum} Bath
                </span>
              )}
              {listing.carpet_area_sqft !== undefined && (
                <span className="inline-flex items-center gap-1">
                  <Ruler className="size-3.5 text-slate-400" />
                  {listing.carpet_area_sqft} sqft
                </span>
              )}
              <span className="rounded-full bg-slate-50 px-2 py-0.5 ring-1 ring-slate-100">
                {FURNISHING_LABELS[listing.furnishing] ?? listing.furnishing}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3.5 text-slate-400" />
                {isAvailableNow
                  ? "Available Now"
                  : `From ${new Date(listing.available_from).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
              </span>
            </div>

            {topAmenities.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {topAmenities.map((amenity) => {
                  const Icon = getAmenityIcon(amenity);
                  return (
                    <span
                      key={amenity}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-100"
                    >
                      <Icon className="size-3 text-slate-400" />
                      {getAmenityLabel(amenity)}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
            <Button
              asChild
              size="sm"
              className="rounded-lg bg-blue-600 text-white shadow-sm hover:bg-blue-700"
            >
              <Link
                href={listingHref}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                View Details
              </Link>
            </Button>
            {whatsappUrl && (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="rounded-lg border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
              >
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <MessageCircle className="size-4" />
                  <span className="hidden sm:inline">WhatsApp</span>
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
