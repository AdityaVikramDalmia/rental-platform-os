import type { Metadata } from "next";
import { Calculator, CheckSquare, Clock3, MapPinned, PlayCircle, Route } from "lucide-react";
import Link from "next/link";
import { faqCategories, faqData } from "./data/faq-how-it-works";
import { FaqSection } from "@/components/public/faq-section";
import { ProcessTimeline } from "@/components/public/process-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "How Renting Works",
  description:
    "Understand DemoRentals's end-to-end rental process, from search and visits to final move-in support.",
  alternates: {
    canonical: "/how-it-works",
  },
  openGraph: {
    title: "How Renting Works - DemoRentals",
    description:
      "Understand DemoRentals's end-to-end rental process, from search and visits to final move-in support.",
    type: "website",
    url: "/how-it-works",
  },
};

const HERO_STATS = [
  { label: "Average search-to-move timeline", value: "7-14 days", icon: Clock3 },
  { label: "Verified homes listed every month", value: "120+", icon: MapPinned },
  { label: "Tenant success support", value: "Dedicated team", icon: CheckSquare },
] as const;

const TOOL_CARDS = [
  {
    title: "Rent Calculator",
    description: "Estimate monthly affordability by combining rent, commute, and utility spend.",
    icon: Calculator,
  },
  {
    title: "Commute Estimator",
    description: "Compare travel time from shortlisted homes to your daily destinations.",
    icon: Route,
  },
  {
    title: "Roommate Quiz",
    description: "Find compatibility signals before committing to a shared rental setup.",
    icon: CheckSquare,
  },
] as const;

const CHECKLIST_GROUPS = [
  {
    title: "Before Visit",
    items: [
      "Confirm exact rent and maintenance breakup",
      "Check water, power backup, and security setup",
      "Verify distance to office or transit points",
    ],
  },
  {
    title: "Before Agreement",
    items: [
      "Validate agreement duration and lock-in terms",
      "Confirm notice period and exit conditions",
      "Cross-check deposit refund clauses",
    ],
  },
  {
    title: "Before Move-in",
    items: [
      "Capture handover photos of fixtures and walls",
      "Collect meter readings and key inventory",
      "Store owner and emergency contact details",
    ],
  },
] as const;

const VIDEO_CARDS = [
  "How we helped a family shortlist in 48 hours",
  "From inquiry to move-in: tenant journey breakdown",
  "Avoiding rental red flags during property visits",
  "Budget planning tips for first-time renters",
] as const;

export default function HowItWorksPage() {
  return (
    <div>
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 py-12 text-white lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-bold sm:text-4xl">How renting works with DemoRentals</h1>
            <p className="mt-4 text-base text-slate-200 sm:text-lg">
              A transparent process designed to reduce confusion, save time, and help you move in
              confidently.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {HERO_STATS.map((stat) => {
              const Icon = stat.icon;

              return (
                <div
                  key={stat.label}
                  className="rounded-xl border border-white/10 bg-white/10 p-4 text-center"
                >
                  <Icon className="mx-auto mb-2 size-5 text-blue-200" />
                  <p className="text-xl font-bold">{stat.value}</p>
                  <p className="mt-1 text-sm text-slate-200">{stat.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white py-12 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Rental journey timeline
            </h2>
            <p className="mt-2 text-muted-foreground">Click each step to view what happens next.</p>
          </div>
          <ProcessTimeline />
        </div>
      </section>

      <section className="bg-slate-50 py-12 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Tools hub</h2>
              <p className="mt-2 text-muted-foreground">
                Helpful utilities launching soon for smarter rental decisions.
              </p>
            </div>
            <Badge variant="outline">Teaser</Badge>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {TOOL_CARDS.map((tool) => {
              const Icon = tool.icon;

              return (
                <Card
                  key={tool.title}
                  className="border-slate-200 py-0 transition-shadow hover:shadow-lg"
                >
                  <CardHeader>
                    <div className="mb-2 inline-flex size-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-lg text-slate-900">{tool.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <p className="text-sm text-slate-600">{tool.description}</p>
                    <Badge variant="outline">Coming Soon</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white py-12 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Rental checklist preview
            </h2>
            <p className="mt-2 text-muted-foreground">
              Interactive checklist with reminders and progress tracking is coming soon.
            </p>
          </div>

          <div className="mb-6 h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-0 bg-blue-600" />
          </div>
          <p className="mb-6 text-sm font-medium text-amber-700">Progress: 0% - Coming soon!</p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {CHECKLIST_GROUPS.map((group) => (
              <Card key={group.title} className="border-slate-200 py-0">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-900">{group.title}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-2 text-sm text-slate-600">
                    {group.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-0.5 text-slate-400">-</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-12 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Testimonial videos</h2>
            <p className="mt-2 text-muted-foreground">
              Short stories from renters on how they found the right home.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VIDEO_CARDS.map((title) => (
              <Card key={title} className="overflow-hidden border-slate-200 py-0">
                <div className="relative h-40 bg-slate-200">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm">
                      <PlayCircle className="size-6" />
                    </div>
                  </div>
                </div>
                <CardContent className="px-4 py-4 text-sm text-slate-700">{title}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-12 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Frequently asked questions
            </h2>
            <p className="mt-2 text-muted-foreground">
              Everything you need to know before, during, and after your rental journey.
            </p>
          </div>
          <FaqSection data={faqData} categories={faqCategories} />
        </div>
      </section>

      <section className="bg-slate-50 py-12 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            Ready to start searching?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Explore verified listings and schedule your first guided visit.
          </p>
          <div className="mt-6">
            <Button asChild size="lg">
              <Link href="/listings">Start Your Search</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
