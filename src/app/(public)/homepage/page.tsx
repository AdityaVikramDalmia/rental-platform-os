import type { FunctionReturnType } from "convex/server";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { fetchQuery } from "convex/nextjs";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";
import { FeaturedListings } from "@/components/public/featured-listings";
import { HeroSection } from "@/components/public/hero-section";
import { HomepageTimeline } from "@/components/public/homepage-timeline";
import { LocalitySearch } from "@/components/public/locality-search";
import { WhyPlatform } from "@/components/public/why-rental-platform-os";
import { ProofStrip } from "@/components/public/proof-strip";
import { SectionContainer, SectionReveal } from "@/components/public/animations";
import { Button } from "@/components/ui/button";

const TestimonialCarousel = dynamic(() =>
  import("@/components/public/testimonial-carousel").then((m) => ({
    default: m.TestimonialCarousel,
  })),
);
const ComparisonTable = dynamic(() =>
  import("@/components/public/comparison-table").then((m) => ({ default: m.ComparisonTable })),
);
const ToolsPreview = dynamic(() =>
  import("@/components/public/tools-preview").then((m) => ({ default: m.ToolsPreview })),
);
const CTASection = dynamic(() =>
  import("@/components/public/cta-section").then((m) => ({ default: m.CTASection })),
);

export const metadata: Metadata = {
  title: "DemoRentals - Find Your Perfect Rental Home",
  description:
    "Find verified rental properties with transparent pricing. Browse listings, schedule visits, and move in hassle-free.",
  alternates: {
    canonical: "/homepage",
  },
  openGraph: {
    title: "DemoRentals - Find Your Perfect Rental Home",
    description:
      "Find verified rental properties with transparent pricing. Browse listings, schedule visits, and move in hassle-free.",
    type: "website",
    url: "/homepage",
  },
};

export default async function Homepage() {
  let featuredListings: FunctionReturnType<typeof api.listings.listFeatured> = [];
  try {
    featuredListings = await fetchQuery(api.listings.listFeatured, { limit: 9 });
  } catch {
    /* empty */
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "RealEstateAgent",
                "@id": "https://rental-platform-os.app/#organization",
                name: "Rental Platform OS by DemoRentals",
                description:
                  "Verified rental properties with zero brokerage in Bangalore. Guided visits, transparent pricing, and direct owner contact.",
                url: "https://rental-platform-os.app",
                areaServed: {
                  "@type": "City",
                  name: "Bangalore",
                },
                priceRange: "₹₹",
              },
              {
                "@type": "WebSite",
                "@id": "https://rental-platform-os.app/#website",
                url: "https://rental-platform-os.app",
                name: "Rental Platform OS",
                publisher: { "@id": "https://rental-platform-os.app/#organization" },
              },
            ],
          }),
        }}
      />
      <div>
        <HeroSection />

        <ProofStrip />

        <SectionContainer className="bg-gradient-to-b from-slate-50 to-white">
          <SectionReveal>
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
                Find Your Perfect Rental
              </h2>
              <p className="mt-3 text-lg text-slate-600">
                Search by area, budget, or property type
              </p>
            </div>
          </SectionReveal>
          <SectionReveal delay={0.1}>
            <LocalitySearch />
          </SectionReveal>
        </SectionContainer>

        <SectionContainer className="bg-white" id="featured">
          <SectionReveal>
            <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
                  Featured Properties
                </h2>
                <p className="mt-3 text-lg text-slate-600">
                  Hand-picked verified listings updated daily
                </p>
              </div>
              <Button asChild variant="outline" size="lg">
                <Link href="/listings">
                  View All Listings <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </div>
          </SectionReveal>
          <FeaturedListings listings={featuredListings} />
        </SectionContainer>

        <SectionContainer className="bg-white" id="why-rental-platform-os">
          <SectionReveal>
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Why Rental Platform OS</h2>
              <p className="mt-3 text-lg text-slate-600">
                What makes finding a home with us different
              </p>
            </div>
          </SectionReveal>
          <WhyPlatform />
        </SectionContainer>

        <SectionContainer className="bg-slate-50" id="testimonials">
          <SectionReveal>
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
                What Our Tenants Say
              </h2>
              <p className="mt-3 text-lg text-slate-600">
                Real stories from people who found their home with Rental Platform OS
              </p>
            </div>
          </SectionReveal>
          <TestimonialCarousel />
        </SectionContainer>

        <SectionContainer className="bg-white" id="compare">
          <SectionReveal>
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
                Rental Platform OS vs Traditional Brokers
              </h2>
              <p className="mt-3 text-lg text-slate-600">
                See why tenants are switching to a better way to rent
              </p>
            </div>
          </SectionReveal>
          <ComparisonTable />
        </SectionContainer>

        <SectionContainer className="bg-slate-50" id="how-it-works">
          <SectionReveal>
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">How It Works</h2>
              <p className="mt-3 text-lg text-slate-600">
                From search to move-in, we handle the heavy lifting
              </p>
            </div>
          </SectionReveal>
          <HomepageTimeline />
        </SectionContainer>

        <SectionContainer className="bg-slate-50" id="tools">
          <SectionReveal>
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Free Tenant Tools</h2>
              <p className="mt-3 text-lg text-slate-600">
                Plan your move with confidence using our free calculators and quizzes
              </p>
            </div>
          </SectionReveal>
          <ToolsPreview />
        </SectionContainer>

        <CTASection />
      </div>
    </>
  );
}
