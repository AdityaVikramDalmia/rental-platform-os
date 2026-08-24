"use client";

import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const TESTIMONIALS = [
  {
    name: "Priya M.",
    rating: 5,
    comment:
      "Found my dream apartment through DemoRentals. The entire process was smooth and transparent.",
    locality: "Powai, Mumbai",
  },
  {
    name: "Rahul S.",
    rating: 4,
    comment:
      "Great selection of verified properties. The guard-verified approach gives confidence.",
    locality: "Whitefield, Bengaluru",
  },
  {
    name: "Ananya K.",
    rating: 5,
    comment:
      "Moved in within a week of my first visit. Highly recommend DemoRentals for hassle-free renting.",
    locality: "Gurgaon, Delhi NCR",
  },
];

export function StaticTestimonials() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">What Tenants Say</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {TESTIMONIALS.map((testimonial) => (
          <Card key={testimonial.name} className="border-slate-200">
            <CardContent className="space-y-3 pt-6">
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={`${testimonial.name}-star-${i}`}
                    className={`size-4 ${
                      i < testimonial.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                    }`}
                  />
                ))}
              </div>

              <p className="text-sm text-slate-700">{testimonial.comment}</p>

              <div>
                <p className="font-semibold text-slate-900">{testimonial.name}</p>
                <p className="text-xs text-slate-500">{testimonial.locality}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
