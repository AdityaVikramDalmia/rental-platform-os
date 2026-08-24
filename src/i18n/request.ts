import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

const SUPPORTED_LOCALES = ["en", "hi", "hinglish"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get("locale")?.value;
  const locale: SupportedLocale = SUPPORTED_LOCALES.includes(raw as SupportedLocale)
    ? (raw as SupportedLocale)
    : "en";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    formats: {
      number: {
        inr: {
          style: "currency" as const,
          currency: "INR",
          maximumFractionDigits: 0,
        },
      },
      dateTime: {
        short: {
          day: "numeric" as const,
          month: "short" as const,
          year: "numeric" as const,
        },
      },
    },
  };
});
