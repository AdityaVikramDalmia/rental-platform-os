"use client";

import { Building2, Clock, SmilePlus, ThumbsUp } from "lucide-react";
import { Marquee } from "@/components/ui/marquee";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SectionReveal } from "@/components/public/animations";

const PARTNER_SOCIETIES = [
  { name: "Emerald Gateway", city: "Bangalore" },
  { name: "Lakeview Residency", city: "Bangalore" },
  { name: "Sunhaven Dream Acres", city: "Bangalore" },
  { name: "Magnolia Grove", city: "Gurgaon" },
  { name: "Riverside Springs", city: "Bangalore" },
  { name: "Serene Meadows", city: "Bangalore" },
  { name: "Harmony Enclave", city: "Bangalore" },
  { name: "Verdant Living", city: "Bangalore" },
];

const TRUST_METRICS = [
  { label: "Verified Properties", value: 500, suffix: "+", icon: Building2, useTicker: true },
  { label: "Happy Tenants", value: 2000, suffix: "+", icon: SmilePlus, useTicker: true },
  { label: "Satisfaction", value: 98, suffix: "%", icon: ThumbsUp, useTicker: true },
  {
    label: "Response Time",
    value: null,
    suffix: "",
    icon: Clock,
    useTicker: false,
    staticText: "< 5 Min",
  },
] as const;

function SocietyPill({ name, city }: { name: string; city: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
        {name.charAt(0)}
      </div>
      <div className="whitespace-nowrap">
        <span className="text-sm font-medium text-slate-700">{name}</span>
        <span className="ml-1.5 text-xs text-slate-400">{city}</span>
      </div>
    </div>
  );
}

export function ProofStrip() {
  return (
    <SectionReveal>
      <section className="border-y border-slate-100 bg-white py-10 lg:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="mb-6 text-center text-xs font-medium uppercase tracking-widest text-slate-400">
            Trusted by societies across India
          </p>
        </div>

        <div className="relative space-y-3">
          <Marquee pauseOnHover className="[--duration:40s]">
            {PARTNER_SOCIETIES.map((s) => (
              <SocietyPill key={s.name} name={s.name} city={s.city} />
            ))}
          </Marquee>
          <Marquee reverse pauseOnHover className="[--duration:40s]">
            {PARTNER_SOCIETIES.map((s) => (
              <SocietyPill key={`rev-${s.name}`} name={s.name} city={s.city} />
            ))}
          </Marquee>
        </div>

        <div className="mx-auto mt-10 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-8">
            {TRUST_METRICS.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="flex flex-col items-center gap-1 text-center">
                  <Icon className="mb-1 size-5 text-blue-500" />
                  <p className="text-xl font-bold text-slate-900 sm:text-2xl">
                    {metric.useTicker && metric.value != null ? (
                      <>
                        <NumberTicker
                          value={metric.value}
                          delay={0.3}
                          className="text-xl font-bold text-slate-900 sm:text-2xl"
                        />
                        {metric.suffix}
                      </>
                    ) : (
                      "staticText" in metric && metric.staticText
                    )}
                  </p>
                  <p className="text-xs text-slate-500">{metric.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </SectionReveal>
  );
}
