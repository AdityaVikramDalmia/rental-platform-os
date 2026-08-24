"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { motion } from "motion/react";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Particles } from "@/components/ui/particles";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Button } from "@/components/ui/button";

const TRUST_STATS = [
  { label: "Properties Managed", value: 500, suffix: "+" },
  { label: "Happy Tenants", value: 2000, suffix: "+" },
  { label: "Cities", value: 3, suffix: "" },
] as const;

export function HeroSection() {
  const router = useRouter();
  const whatsappPhone = process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE ?? "";
  const whatsappMessage = "Hi DemoRentals team, I am looking for a rental home.";
  const whatsappHref = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  const [particleCount, setParticleCount] = useState(80);

  useEffect(() => {
    const updateCount = () => {
      setParticleCount(window.innerWidth < 640 ? 40 : 80);
    };
    updateCount();
    window.addEventListener("resize", updateCount);
    return () => window.removeEventListener("resize", updateCount);
  }, []);

  return (
    <section className="relative min-h-[70vh] overflow-hidden bg-slate-950 lg:min-h-[80vh]">
      {/* Particle background */}
      <Particles
        className="absolute inset-0"
        quantity={particleCount}
        staticity={30}
        ease={50}
        color="#60a5fa"
        refresh
      />

      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(96,165,250,0.08)_0%,transparent_70%)]" />

      {/* Content */}
      <div className="relative z-10 flex min-h-[70vh] items-center lg:min-h-[80vh]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            {/* Eyebrow */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="mb-5"
            >
              <AnimatedGradientText
                speed={1.5}
                colorFrom="#60a5fa"
                colorTo="#a78bfa"
                className="text-sm font-semibold tracking-[0.15em] uppercase"
              >
                DemoRentals Rentals
              </AnimatedGradientText>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
              className="bg-gradient-to-r from-white via-blue-100 to-blue-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl lg:text-5xl xl:text-6xl"
            >
              Find your next rental home without the usual stress
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35, ease: "easeOut" }}
              className="mx-auto mt-5 max-w-xl text-base text-slate-300 sm:text-lg"
            >
              Browse verified properties, compare transparent pricing, and schedule guided visits in
              minutes.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.55, ease: "easeOut" }}
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <ShimmerButton
                shimmerColor="#93c5fd"
                shimmerSize="0.05em"
                shimmerDuration="3s"
                background="rgba(37, 99, 235, 0.9)"
                borderRadius="12px"
                className="px-8 py-3 text-sm font-semibold"
                onClick={() => router.push("/listings")}
              >
                Browse Listings
              </ShimmerButton>
              {whatsappHref ? (
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full border-white/20 bg-transparent text-white hover:bg-white/10 sm:w-auto"
                  >
                    <MessageCircle className="mr-2 size-4" />
                    WhatsApp Us
                  </Button>
                </a>
              ) : (
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="w-full border-white/20 bg-transparent text-white hover:bg-white/10 sm:w-auto"
                >
                  <Link href="/contact">Contact Us</Link>
                </Button>
              )}
            </motion.div>

            {/* Trust stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.75, ease: "easeOut" }}
              className="mx-auto mt-12 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-3"
            >
              {TRUST_STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-center backdrop-blur-sm"
                >
                  <p className="text-2xl font-bold text-white">
                    <NumberTicker
                      value={stat.value}
                      delay={0.9}
                      className="text-2xl font-bold text-white"
                    />
                    {stat.suffix}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
