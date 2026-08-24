import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { LISTING_STATUS } from "../../../../lib/constants";
import { formatINR, paiseToRupees } from "../../../../lib/money";
import ConvexClientProvider from "@/components/shared/ConvexClientProvider";
import { ArchivedNotice } from "./components/archived-notice";
import { PropertyDetailClient } from "./components/property-detail-client";

type ListingPayload = {
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
    house_rules?: string[];
    parking?: string;
    pet_friendly?: boolean;
    amenities?: string[];
    building_name: string;
    society_name: string;
    city: string;
    locality: string;
    flat_number: string;
  };
  photos: {
    _id: string;
    storage_id: string;
    display_order: number;
    url: string | null;
  }[];
  roommate_profiles: {
    _id: string;
    name_alias: string;
    age_range?: string;
    gender?: string;
    profession?: string;
    lifestyle_tags?: string[];
    bio?: string;
    move_in_date?: number;
  }[];
  commute_landmarks: {
    _id: string;
    name: string;
    category: string;
    distance_km: number;
    time_minutes?: number;
    transport_mode?: string;
  }[];
  inquiry_count: number;
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
};

type Props = { params: Promise<{ slug: string }> };

function getConvexHttpUrl(): string | null {
  return process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? null;
}

function getConvexStorageUrl(): string {
  return process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
}

async function fetchListing(slug: string): Promise<ListingPayload | null> {
  const convexUrl = getConvexHttpUrl();
  if (!convexUrl) return null;

  const res = await fetch(`${convexUrl}/api/listing/${slug}`, {
    next: { revalidate: 60 },
  });

  if (!res.ok) return null;
  return res.json() as Promise<ListingPayload>;
}

function buildCoverPhotoUrl(storageId: string): string {
  const convexUrl = getConvexStorageUrl();
  return `${convexUrl}/api/storage/${storageId}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const payload = await fetchListing(slug);

  if (!payload) {
    return { title: "Listing Not Found" };
  }

  const listing = payload.listing;

  const title = `${listing.bhk_config} in ${listing.society_name} - ${listing.building_name}`;
  const description = `${listing.bhk_config} ${listing.furnishing.toLowerCase().replace(/_/g, " ")} apartment for rent at ${formatINR(listing.rent_monthly)}/month in ${listing.society_name}, ${listing.building_name}`;
  const firstPhoto = payload.photos[0];
  const coverUrl = firstPhoto
    ? (firstPhoto.url ?? buildCoverPhotoUrl(firstPhoto.storage_id))
    : undefined;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Rental Platform OS`,
      description,
      ...(coverUrl && {
        images: [{ url: coverUrl, width: 1200, height: 630, alt: title }],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Rental Platform OS`,
      description,
      ...(coverUrl && { images: [coverUrl] }),
    },
  };
}

export default async function ListingPage({ params }: Props) {
  const { slug } = await params;
  const payload = await fetchListing(slug);
  const signInUrl = await getSignInUrl();

  if (!payload) {
    notFound();
  }

  const listing = payload.listing;

  const isArchived = listing.status === LISTING_STATUS.ARCHIVED;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Apartment",
    name: `${listing.bhk_config} in ${listing.society_name}`,
    description:
      listing.description ??
      `${listing.bhk_config} apartment for rent in ${listing.society_name}, ${listing.building_name}`,
    floorLevel: listing.floor_number,
    ...(listing.carpet_area_sqft !== undefined && {
      floorSize: {
        "@type": "QuantitativeValue",
        value: listing.carpet_area_sqft,
        unitCode: "FTK",
      },
    }),
    ...(listing.pet_friendly !== undefined && {
      petsAllowed: listing.pet_friendly,
    }),
    offers: {
      "@type": "Offer",
      price: paiseToRupees(listing.rent_monthly),
      priceCurrency: "INR",
      availability:
        listing.status === LISTING_STATUS.PUBLISHED
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <main>
        {isArchived ? (
          <ArchivedNotice societyName={listing.society_name} buildingName={listing.building_name} />
        ) : (
          <ConvexClientProvider>
            <Suspense>
              <PropertyDetailClient
                listing={{
                  ...listing,
                  photos: payload.photos.map((photo) => photo.storage_id),
                }}
                roommateProfiles={payload.roommate_profiles}
                commuteLandmarks={payload.commute_landmarks}
                trust={payload.trust}
                signInUrl={signInUrl}
              />
            </Suspense>
          </ConvexClientProvider>
        )}
      </main>
    </>
  );
}
