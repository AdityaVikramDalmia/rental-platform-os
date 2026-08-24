"use client";

import { Clock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type RateLimitScreenProps = {
  count?: number;
  limit?: number;
  message?: string;
};

export function RateLimitScreen({ count, limit, message }: RateLimitScreenProps) {
  const t = useTranslations("guard.submitLead");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 text-center">
      <div className="space-y-3">
        <Clock className="mx-auto size-16 text-amber-500" />
        <h2 className="text-2xl font-bold text-slate-900">{t("limitReached")}</h2>
      </div>

      <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-lg font-semibold text-amber-800">{message ?? t("limitReached")}</p>
        {count !== undefined && limit !== undefined && (
          <p className="mt-1 text-base text-amber-700">{t("remaining", { count, max: limit })}</p>
        )}
      </div>

      <Button asChild className="h-12 w-full rounded-xl bg-slate-900 text-base font-semibold">
        <Link href="/guard/leads">{t("viewMyLeads")}</Link>
      </Button>
    </div>
  );
}
