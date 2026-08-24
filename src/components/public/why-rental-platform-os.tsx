"use client";

import { BadgeIndianRupee, MapPin, Receipt, ShieldCheck, UserCheck } from "lucide-react";
import { motion } from "motion/react";
import { StaggerChildren } from "@/components/public/animations";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Verified Listings Only",
    description:
      "Every property is physically verified before it goes live. No fake photos, no phantom listings, no wasted visits. What you see is what you get.",
    size: "large" as const,
    gradient: "from-blue-50 to-blue-100/50",
  },
  {
    icon: BadgeIndianRupee,
    title: "Zero Brokerage",
    description:
      "No broker fees. No hidden charges. You pay rent and deposit \u2014 that\u2019s it.",
    size: "standard" as const,
    gradient: "from-emerald-50 to-emerald-100/50",
  },
  {
    icon: UserCheck,
    title: "Direct Owner Contact",
    description:
      "Chat directly with property owners through our platform. No middlemen, no commission games.",
    size: "standard" as const,
    gradient: "from-amber-50 to-amber-100/50",
  },
  {
    icon: MapPin,
    title: "Guided Property Visits",
    description:
      "Schedule visits at your convenience. Our local team accompanies you \u2014 no awkward broker tours.",
    size: "standard" as const,
    gradient: "from-purple-50 to-purple-100/50",
  },
  {
    icon: Receipt,
    title: "Transparent Pricing",
    description:
      "Rent, deposit, maintenance, and move-in costs \u2014 all shown upfront before you visit. Compare properties on equal terms. No surprises at signing.",
    size: "large" as const,
    gradient: "from-rose-50 to-rose-100/50",
  },
];

export function WhyPlatform() {
  return (
    <StaggerChildren
      staggerDelay={0.1}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {FEATURES.map((feature) => {
        const Icon = feature.icon;

        return (
          <div
            key={feature.title}
            className={cn(
              "group relative overflow-hidden rounded-2xl border border-slate-100 p-6 lg:p-8",
              "transition-all duration-300 hover:shadow-lg hover:border-slate-200",
              `bg-gradient-to-br ${feature.gradient}`,
              feature.size === "large" ? "sm:col-span-2" : "",
            )}
          >
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              whileInView={{ scale: 1, rotate: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
              className="mb-4 flex size-12 items-center justify-center rounded-xl bg-white shadow-sm"
            >
              <Icon className="size-6 text-blue-600" />
            </motion.div>
            <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.description}</p>
          </div>
        );
      })}
    </StaggerChildren>
  );
}
