"use client";

import { useMutation, useQuery } from "convex/react";
import { Award, Calendar, ChevronRight, Globe, KeyRound, Loader2, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { type ComponentProps, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import {
  LANGUAGE_PREFERENCE,
  USER_TYPE,
  type LanguagePreference,
} from "../../../../../lib/constants";
import { signOutAction } from "@/app/actions/auth";
import { LanguageSelector } from "@/components/guard/LanguageSelector";
import { GuardProfileCard } from "@/components/guard/GuardProfileCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgeCard } from "./components/badge-card";

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_TZ = "Asia/Kolkata";

type ScheduleItem = {
  date: number;
  shifts: Array<{ start_time: string; end_time: string }>;
};

function getStartOfDayIST(ms: number): number {
  const istMs = ms + IST_OFFSET_MS;
  const dayStart = Math.floor(istMs / DAY_MS) * DAY_MS;
  return dayStart - IST_OFFSET_MS;
}

function isLanguagePreference(value: string): value is LanguagePreference {
  return Object.values(LANGUAGE_PREFERENCE).includes(value as LanguagePreference);
}

export default function GuardProfilePage() {
  const t = useTranslations("guard.profile");
  const tCommon = useTranslations("guard.common");
  const format = useFormatter();
  const router = useRouter();
  const currentUser = useQuery(api.users.getCurrentUser);
  const profile = useQuery(api.guards.getMyProfile);
  const badges = useQuery(api.incentives.getMyCards);
  const isOpsUser = currentUser?.user_type === USER_TYPE.OPS;

  const now = Date.now();
  const todayIST = getStartOfDayIST(now);
  const sevenDaysLater = todayIST + 7 * DAY_MS;

  const schedule = useQuery(
    api.guardShifts.getMySchedule,
    !isOpsUser
      ? {
          from_date: todayIST,
          to_date: sevenDaysLater,
        }
      : "skip",
  );

  const updateMyLanguage = useMutation(api.guards.updateMyLanguage);
  const [languageUpdating, setLanguageUpdating] = useState(false);
  const badgeItems: Array<ComponentProps<typeof BadgeCard>["badge"]> = badges ?? [];
  const scheduleItems: ScheduleItem[] = (schedule as ScheduleItem[] | undefined) ?? [];

  const upcomingShifts = useMemo(() => {
    return scheduleItems.filter((day) => day.shifts.length > 0).slice(0, 3);
  }, [scheduleItems]);

  if (profile === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-80 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-base text-slate-500">{t("profileNotFound")}</p>
      </div>
    );
  }

  const rawLang = profile.language_preference ?? "";
  const currentLanguage = isLanguagePreference(rawLang) ? rawLang : LANGUAGE_PREFERENCE.en;

  async function handleLanguageChange(value: string) {
    if (!isLanguagePreference(value) || value === currentLanguage) {
      return;
    }

    setLanguageUpdating(true);

    try {
      await updateMyLanguage({ language: value });

      if (typeof window !== "undefined") {
        document.cookie = `locale=${value}; path=/; max-age=31536000; SameSite=Lax`;
        localStorage.setItem("locale", value);
        localStorage.setItem("hasChosenLanguage", "true");
      }

      toast.success(t("languageUpdated"));
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : tCommon("error");
      toast.error(message);
    } finally {
      setLanguageUpdating(false);
    }
  }

  return (
    <div className="space-y-4">
      <GuardProfileCard
        name={profile.name}
        phone={profile.phone}
        status={profile.status}
        userType={currentUser?.user_type}
        guardType={profile.guard_type}
        societyName={profile.society_name}
        photoUrl={profile.photo_url}
        canEditPhoto={!isOpsUser}
      />

      <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <Award className="size-5 text-amber-500" />
            {t("badges")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {badges === undefined ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-5 animate-spin text-slate-400" />
            </div>
          ) : badgeItems.length === 0 ? (
            <p className="text-base leading-relaxed text-slate-500">{t("noBadges")}</p>
          ) : (
            <div className="space-y-3">
              {badgeItems.map((badge) => (
                <BadgeCard key={`${badge.card_type}-${badge.level}`} badge={badge} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <Calendar className="size-5 text-blue-500" />
            {t("schedule")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isOpsUser ? (
            <p className="text-sm text-slate-500">Shifts are available only for guard accounts.</p>
          ) : schedule === undefined ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-5 animate-spin text-slate-400" />
            </div>
          ) : upcomingShifts.length === 0 ? (
            <p className="text-sm text-slate-500">{t("noShifts")}</p>
          ) : (
            <div className="space-y-2">
              {upcomingShifts.map((day) => (
                <div
                  key={day.date}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5"
                >
                  <span className="text-sm font-medium text-slate-700">
                    {`${format.dateTime(new Date(day.date), {
                      weekday: "short",
                      timeZone: IST_TZ,
                    })}, ${format.dateTime(new Date(day.date), "short")}`}
                  </span>
                  <span className="text-sm text-slate-500">
                    {day.shifts.map((s) => `${s.start_time}–${s.end_time}`).join(", ")}
                  </span>
                </div>
              ))}
            </div>
          )}
          {!isOpsUser && (
            <Link
              href="/guard/shifts"
              className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              {t("viewFullSchedule")}
              <ChevronRight className="size-4" />
            </Link>
          )}
        </CardContent>
      </Card>

      {!isOpsUser && (
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2">
              <Globe className="size-5 text-slate-500" />
              <span className="text-base font-medium text-slate-900">{t("language")}</span>
            </div>
            <div className="w-full max-w-[260px]">
              <LanguageSelector
                currentLocale={currentLanguage}
                onSelect={handleLanguageChange}
                disabled={languageUpdating}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <Button
          asChild
          variant="outline"
          className="h-12 min-h-11 w-full justify-between rounded-xl border-slate-200 px-4 text-base font-medium text-slate-900"
        >
          <Link href={isOpsUser ? "/ops/change-password" : "/guard/change-password"}>
            <span className="flex items-center gap-2">
              <KeyRound className="size-5 text-slate-500" />
              {t("changePassword")}
            </span>
            <ChevronRight className="size-5 text-slate-400" />
          </Link>
        </Button>

        <form action={signOutAction}>
          <Button
            type="submit"
            variant="outline"
            className="h-12 min-h-11 w-full justify-between rounded-xl border-red-200 px-4 text-base font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <span className="flex items-center gap-2">
              <LogOut className="size-5" />
              {t("signOut")}
            </span>
          </Button>
        </form>
      </div>
    </div>
  );
}
