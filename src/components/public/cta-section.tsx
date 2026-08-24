"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { SectionReveal } from "@/components/public/animations";

export function CTASection() {
  const router = useRouter();

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="animate-blob absolute -left-4 top-0 size-72 rounded-full bg-blue-500 mix-blend-multiply blur-3xl filter" />
        <div className="animate-blob animation-delay-2000 absolute -right-4 top-0 size-72 rounded-full bg-purple-500 mix-blend-multiply blur-3xl filter" />
        <div className="animate-blob animation-delay-4000 absolute -bottom-8 left-20 size-72 rounded-full bg-indigo-500 mix-blend-multiply blur-3xl filter" />
      </div>

      <SectionReveal>
        <div className="relative z-10 px-4 py-20 text-center lg:py-28">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Ready to Find Your New Home?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300">
            Browse verified properties with zero brokerage. Transparent pricing, guided visits, and
            direct owner contact.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <ShimmerButton
              className="h-12 px-8"
              shimmerColor="#93c5fd"
              background="rgba(37, 99, 235, 0.9)"
              onClick={() => router.push("/listings")}
            >
              <span className="text-base font-semibold text-white">Browse Listings</span>
            </ShimmerButton>

            {process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE && (
              <a
                href={`https://wa.me/${process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE}?text=${encodeURIComponent("Hi, I need help finding a rental property.")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/30 px-8 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                <MessageCircle className="size-4" />
                WhatsApp Us
              </a>
            )}
          </div>

          <p className="mt-8 text-sm text-slate-400">
            Own a property?{" "}
            <Link
              href="/contact"
              className="text-blue-400 underline transition-colors hover:text-blue-300"
            >
              List it for free &rarr;
            </Link>
          </p>
        </div>
      </SectionReveal>
    </section>
  );
}
