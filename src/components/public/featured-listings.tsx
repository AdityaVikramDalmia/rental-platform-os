"use client";

import type { FunctionReturnType } from "convex/server";
import Autoplay from "embla-carousel-autoplay";
import Link from "next/link";
import { CheckCircle, Home, ImageOff, MapPin } from "lucide-react";
import { motion } from "motion/react";
import type { api } from "../../../convex/_generated/api";
import { formatINR } from "../../../lib/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

type FeaturedListingsData = FunctionReturnType<typeof api.listings.listFeatured>;
type FeaturedListing = FeaturedListingsData[number];

function ListingCard({ listing }: { listing: FeaturedListing }) {
  return (
    <Card className="group overflow-hidden border-slate-200 py-0 shadow-sm transition-shadow duration-300 hover:shadow-xl">
      <div className="relative h-52 w-full overflow-hidden rounded-t-xl bg-slate-100">
        {listing.first_photo_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Uses signed Convex storage URLs in carousel cards. */}
            <img
              src={listing.first_photo_url}
              alt={`${listing.bhk_config} at ${listing.society_name ?? "DemoRentals listing"}`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
              className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm"
            >
              <CheckCircle className="size-3.5" /> Verified
            </motion.div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <div className="flex flex-col items-center gap-2 text-sm">
              <ImageOff className="size-6" />
              No photo available
            </div>
          </div>
        )}
      </div>

      <CardContent className="space-y-3 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="bg-blue-50 text-blue-700">
            {listing.bhk_config}
          </Badge>
          <p className="text-xl font-bold text-slate-900">
            {formatINR(listing.rent_monthly)}
            <span className="text-sm font-normal text-slate-500">/mo</span>
          </p>
        </div>

        <div className="space-y-1">
          <p className="line-clamp-1 text-base font-semibold text-slate-900">
            {listing.society_name ?? "Verified Society"}
          </p>
          <p className="inline-flex items-center gap-1 text-sm text-slate-500">
            <MapPin className="size-3.5" />
            {listing.city ?? "City unavailable"}
          </p>
        </div>

        <Link
          href={`/listing/${listing.slug}`}
          className="inline-flex text-sm font-medium text-blue-700 transition-colors hover:text-blue-800"
        >
          View Details &rarr;
        </Link>
      </CardContent>
    </Card>
  );
}

export function FeaturedListings({ listings }: { listings: FeaturedListingsData }) {
  if (listings.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-12 text-center">
        <Home className="mx-auto mb-3 size-10 text-slate-300" />
        <p className="text-base font-medium text-slate-600">New listings coming soon!</p>
        <p className="mt-1 text-sm text-slate-400">Check back later for verified properties.</p>
      </div>
    );
  }

  const useLoop = listings.length > 1;

  return (
    <Carousel
      opts={{ align: "start", loop: useLoop }}
      plugins={useLoop ? [Autoplay({ delay: 4000, stopOnInteraction: true })] : []}
      className="px-1 sm:px-2"
    >
      <CarouselContent>
        {listings.map((listing) => (
          <CarouselItem key={listing._id} className="basis-full sm:basis-1/2 lg:basis-1/3">
            <ListingCard listing={listing} />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious
        className={cn("-left-3 hidden bg-white shadow-sm sm:flex", "lg:-left-5")}
        aria-label="Previous featured listing"
      />
      <CarouselNext
        className={cn("-right-3 hidden bg-white shadow-sm sm:flex", "lg:-right-5")}
        aria-label="Next featured listing"
      />
    </Carousel>
  );
}
