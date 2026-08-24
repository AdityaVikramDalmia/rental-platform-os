"use client";

import { PhotoGallery } from "./photo-gallery";
import { PricingBreakdown } from "./pricing-breakdown";
import { AmenitiesGrid } from "./amenities-grid";
import { PropertyDescription } from "./property-description";
import { HouseRules } from "./house-rules";
import { CommuteCalculator } from "./commute-calculator";
import { LocationMap } from "./location-map";
import { RoommateProfiles } from "./roommate-profiles";
import { ContactSidebar } from "./contact-sidebar";
import { SimilarListings } from "./similar-listings";
import { StaticTestimonials } from "./static-testimonials";
import { BreadcrumbNav } from "./breadcrumb-nav";
import { ShareButton } from "./share-button";
import { TrustStrip } from "./trust-strip";

type PropertyDetailClientProps = {
  listing: {
    _id: string;
    slug: string;
    status: string;
    rent_monthly: number;
    deposit?: number;
    maintenance?: number;
    bhk_config: string;
    furnishing: string;
    floor_number: string;
    carpet_area_sqft?: number;
    available_from: number;
    description?: string;
    parking?: string;
    pet_friendly?: boolean;
    amenities?: string[];
    house_rules?: string[];
    photos: string[];
    building_name: string;
    society_name: string;
    city: string;
    flat_number: string;
  };
  roommateProfiles: {
    _id: string;
    name_alias: string;
    age_range?: string;
    gender?: string;
    profession?: string;
    lifestyle_tags?: string[];
    bio?: string;
    move_in_date?: number;
  }[];
  commuteLandmarks: {
    _id: string;
    name: string;
    category: string;
    distance_km: number;
    time_minutes?: number;
    transport_mode?: string;
  }[];
  trust: {
    badges: Array<{
      type: string;
      earned: boolean;
      timestamp?: number;
      count?: number;
    }>;
    freshness_score: number;
    freshness_state: "FRESH" | "AGING" | "STALE";
    last_activity_at?: number;
    last_computed_at: number;
    evidence?: {
      photo_count?: number;
      visit_count?: number;
      has_closure?: boolean;
    };
  } | null;
  signInUrl?: string | null;
};

export function PropertyDetailClient({
  listing,
  roommateProfiles,
  commuteLandmarks,
  trust,
  signInUrl,
}: PropertyDetailClientProps) {
  const mapAddress = [listing.building_name, listing.society_name, listing.city]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <PhotoGallery photos={listing.photos} />

      <div className="mt-6 flex items-center justify-between">
        <BreadcrumbNav
          society_name={listing.society_name}
          building_name={listing.building_name}
          bhk_config={listing.bhk_config}
        />
        <ShareButton
          slug={listing.slug}
          title={`${listing.bhk_config} in ${listing.society_name} - ${listing.building_name}`}
        />
      </div>

      <div className="mt-4">
        <TrustStrip trust={trust} />
      </div>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        <div className="flex-1 space-y-8">
          <PricingBreakdown
            bhk_config={listing.bhk_config}
            rent_monthly={listing.rent_monthly}
            deposit={listing.deposit}
            maintenance={listing.maintenance}
            furnishing={listing.furnishing}
            carpet_area_sqft={listing.carpet_area_sqft}
            floor_number={listing.floor_number}
            available_from={listing.available_from}
            parking={listing.parking}
            pet_friendly={listing.pet_friendly}
          />
          <AmenitiesGrid amenities={listing.amenities ?? []} />
          <PropertyDescription description={listing.description} />
          <HouseRules rules={listing.house_rules} />
          <CommuteCalculator landmarks={commuteLandmarks} />
          <LocationMap address={mapAddress} />
          <RoommateProfiles profiles={roommateProfiles} />
          <StaticTestimonials />
          <SimilarListings
            listingId={listing._id}
            bhk_config={listing.bhk_config}
            society_name={listing.society_name}
          />
        </div>

        <div className="lg:w-[380px] lg:shrink-0">
          <ContactSidebar
            listingId={listing._id}
            slug={listing.slug}
            rent_monthly={listing.rent_monthly}
            deposit={listing.deposit}
            bhk_config={listing.bhk_config}
            society_name={listing.society_name}
            building_name={listing.building_name}
            floor_number={listing.floor_number}
            signInUrl={signInUrl}
          />
        </div>
      </div>
    </div>
  );
}
