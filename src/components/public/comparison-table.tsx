"use client";

import { motion } from "motion/react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const COMPARISONS = [
  {
    feature: "Brokerage Fee",
    ours: "Zero brokerage",
    traditional: "1-2 months rent",
  },
  {
    feature: "Listing Verification",
    ours: "Every property physically verified",
    traditional: "No verification — fake listings common",
  },
  {
    feature: "Pricing Transparency",
    ours: "All costs shown upfront before visit",
    traditional: "Hidden charges revealed at signing",
  },
  {
    feature: "Property Visits",
    ours: "Guided tours at your convenience",
    traditional: "Broker shows you what earns them commission",
  },
  {
    feature: "Response Time",
    ours: "Under 5 minutes on WhatsApp",
    traditional: "Missed calls, voicemails, days of silence",
  },
  {
    feature: "After Move-In Support",
    ours: "First-month support included",
    traditional: "Broker disappears after the deal",
  },
];

export function ComparisonTable() {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <div className="mb-4 grid grid-cols-3 gap-4 px-4 text-sm">
          <span className="font-semibold text-emerald-600">Rental Platform OS</span>
          <span className="text-center text-slate-400">Feature</span>
          <span className="text-right font-semibold text-red-400">Traditional Broker</span>
        </div>
        <div className="space-y-1">
          {COMPARISONS.map((comp, index) => (
            <div
              key={comp.feature}
              className={cn(
                "grid grid-cols-3 items-center gap-4 rounded-xl px-4 py-4",
                index % 2 === 0 ? "bg-white" : "bg-slate-50",
              )}
            >
              <div className="flex items-center gap-2">
                <motion.span
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 300, delay: index * 0.1 }}
                >
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
                </motion.span>
                <span className="text-sm text-slate-700">{comp.ours}</span>
              </div>
              <span className="text-center text-sm font-medium text-slate-900">{comp.feature}</span>
              <div className="flex items-center justify-end gap-2">
                <span className="text-right text-sm text-slate-400">{comp.traditional}</span>
                <motion.span
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 300, delay: index * 0.1 }}
                >
                  <XCircle className="size-5 shrink-0 text-red-400" />
                </motion.span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile stacked cards */}
      <div className="md:hidden">
        <div className="space-y-3">
          {COMPARISONS.map((comp) => (
            <div key={comp.feature} className="rounded-xl border border-slate-100 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">{comp.feature}</p>
              <div className="mt-2 flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <span className="text-sm text-slate-700">{comp.ours}</span>
              </div>
              <div className="mt-1.5 flex items-start gap-2">
                <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                <span className="text-sm text-slate-400">{comp.traditional}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
