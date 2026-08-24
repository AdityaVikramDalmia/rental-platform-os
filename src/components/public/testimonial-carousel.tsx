"use client";

import Autoplay from "embla-carousel-autoplay";
import { MapPin, Star } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const TESTIMONIALS = [
  {
    name: "Ananya Sharma",
    role: "Software Engineer",
    location: "Demo District, Bangalore",
    avatar: "AS",
    rating: 5,
    comment:
      "Found my 2BHK in Demo District in just 3 days. Zero brokerage saved me ₹40,000. The guided visit made it so easy — no awkward broker calls.",
    highlight: "3 days to move-in",
  },
  {
    name: "Rahul Verma",
    role: "Product Manager",
    location: "HSR Layout, Bangalore",
    avatar: "RV",
    rating: 5,
    comment:
      "Relocated from Delhi with zero stress. Rental Platform OS handled everything — shortlisting, visits, paperwork. I just showed up with my bags.",
    highlight: "Zero stress relocation",
  },
  {
    name: "Priya Nair",
    role: "UX Designer",
    location: "Indiranagar, Bangalore",
    avatar: "PN",
    rating: 5,
    comment:
      "Every listing I saw was exactly as described. No fake photos, no bait-and-switch. First visit, first choice, done. That's how it should work.",
    highlight: "First visit, first choice",
  },
  {
    name: "Kunal Mehta",
    role: "Data Analyst",
    location: "Whitefield, Bangalore",
    avatar: "KM",
    rating: 4,
    comment:
      "The rent calculator helped me budget accurately before I even started looking. Ended up saving ₹5,000/month by choosing the right area.",
    highlight: "₹5,000/month saved",
  },
  {
    name: "Sneha Rao",
    role: "Marketing Lead",
    location: "Electronic City, Bangalore",
    avatar: "SR",
    rating: 5,
    comment:
      "WhatsApp response in under 5 minutes. Visited 4 properties in one day. Signed the agreement the next morning. This is how renting should be.",
    highlight: "4 visits in one day",
  },
  {
    name: "Arjun Kapoor",
    role: "Startup Founder",
    location: "JP Nagar, Bangalore",
    avatar: "AK",
    rating: 5,
    comment:
      "As a startup founder, I don't have time for broker nonsense. Rental Platform OS's transparent pricing and direct owner contact saved me hours.",
    highlight: "Direct owner contact",
  },
];

export function TestimonialCarousel() {
  return (
    <Carousel
      opts={{ align: "start", loop: true }}
      plugins={[Autoplay({ delay: 5000, stopOnInteraction: true })]}
      className="px-1 sm:px-2"
    >
      <CarouselContent>
        {TESTIMONIALS.map((testimonial) => (
          <CarouselItem key={testimonial.name} className="basis-full sm:basis-1/2 lg:basis-1/3">
            <div className="h-full rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-shadow duration-300 hover:shadow-md lg:p-8">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-sm font-semibold text-white">
                  {testimonial.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{testimonial.name}</p>
                  <p className="text-xs text-slate-500">{testimonial.role}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={`${testimonial.name}-${index}`}
                      className={`size-4 ${
                        index < testimonial.rating
                          ? "fill-amber-400 text-amber-400"
                          : "text-slate-300"
                      }`}
                    />
                  ))}
                </div>
                <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {testimonial.highlight}
                </span>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                &ldquo;{testimonial.comment}&rdquo;
              </p>

              <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                <MapPin className="size-3" />
                {testimonial.location}
              </p>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="-left-3 hidden bg-white shadow-sm sm:flex lg:-left-5" />
      <CarouselNext className="-right-3 hidden bg-white shadow-sm sm:flex lg:-right-5" />
    </Carousel>
  );
}
