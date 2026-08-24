"use client";

type GuardLanguage = "en" | "hi" | "hinglish";

const RULE_BANNER_TEXT: Record<GuardLanguage, string> = {
  en: "⚠️ IMPORTANT: Do not negotiate rent. Do not collect any money. For pricing and agreements, ask tenant/owner to speak to the DemoRentals team.",
  hi: "⚠️ ज़रूरी: किराया तय न करें। कोई पैसा न लें। कीमत और समझौते के लिए किरायेदार/मालिक को DemoRentals टीम से बात करने को कहें।",
  hinglish:
    "⚠️ IMPORTANT: Rent negotiate mat karo. Koi paisa mat lo. Pricing aur agreement ke liye tenant/owner ko DemoRentals team se baat karne bolo.",
};

type RuleBannerProps = {
  language?: GuardLanguage;
};

export function RuleBanner({ language = "en" }: RuleBannerProps) {
  return (
    <div
      className="sticky top-[72px] z-20 flex min-h-[48px] items-center bg-amber-500 px-4 py-2"
      role="alert"
    >
      <p className="mx-auto w-full max-w-md text-xs font-semibold leading-snug text-amber-950 sm:text-sm">
        {RULE_BANNER_TEXT[language]}
      </p>
    </div>
  );
}
