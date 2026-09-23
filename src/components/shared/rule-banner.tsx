"use client";

import { ShieldAlert } from "lucide-react";

type GuardLanguage = "en" | "hi" | "hinglish";

type RuleCopy = {
  title: string;
  rules: readonly [string, string];
  handoff: string;
};

const RULE_COPY: Record<GuardLanguage, RuleCopy> = {
  en: {
    title: "Field rules",
    rules: ["Don't negotiate rent", "Don't collect money"],
    handoff: "Send tenants and owners to the DemoRentals team for pricing and agreements.",
  },
  hi: {
    title: "ज़रूरी नियम",
    rules: ["किराया तय न करें", "कोई पैसा न लें"],
    handoff: "कीमत और समझौते के लिए किरायेदार/मालिक को DemoRentals टीम से बात करने को कहें।",
  },
  hinglish: {
    title: "Field rules",
    rules: ["Rent negotiate mat karo", "Koi paisa mat lo"],
    handoff: "Pricing aur agreement ke liye tenant/owner ko DemoRentals team se baat karne bolo.",
  },
};

type RuleBannerProps = {
  language?: GuardLanguage;
};

export function RuleBanner({ language = "en" }: RuleBannerProps) {
  const copy = RULE_COPY[language];

  return (
    <div
      role="note"
      aria-label={copy.title}
      className="sticky top-[72px] z-20 border-b border-amber-200 bg-amber-50/95 px-4 py-2.5 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-md items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <ShieldAlert className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            {copy.title}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {copy.rules.map((rule) => (
              <span
                key={rule}
                className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-amber-950 ring-1 ring-amber-200"
              >
                {rule}
              </span>
            ))}
          </div>
          <p className="text-xs leading-snug text-amber-900/80">{copy.handoff}</p>
        </div>
      </div>
    </div>
  );
}
