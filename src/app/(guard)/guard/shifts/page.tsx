"use client";

import { useQuery } from "convex/react";
import { Calendar, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { api } from "../../../../../convex/_generated/api";
import { USER_TYPE } from "../../../../../lib/constants";
import { DAY_MS, getStartOfDayIST } from "../../../../../lib/dates";
import { signOutAction } from "@/app/actions/auth";
import { GuardShiftList } from "@/components/guard/GuardShiftList";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const SCHEDULE_WINDOW_DAYS = 7;
const SKELETON_KEYS = ["one", "two", "three", "four", "five", "six", "seven"] as const;

export default function GuardShiftsPage() {
  const t = useTranslations("guard.shifts");
  const router = useRouter();
  const currentUser = useQuery(api.users.getCurrentUser);
  const { todayISTMidnight, scheduleWindowEnd } = useMemo(() => {
    const todayISTMidnight = getStartOfDayIST();
    return {
      todayISTMidnight,
      scheduleWindowEnd: todayISTMidnight + (SCHEDULE_WINDOW_DAYS - 1) * DAY_MS,
    };
  }, []);

  const canLoadSchedule = currentUser?.user_type === USER_TYPE.GUARD;

  const schedule = useQuery(
    api.guardShifts.getMySchedule,
    canLoadSchedule
      ? {
          from_date: todayISTMidnight,
          to_date: scheduleWindowEnd,
        }
      : "skip",
  );

  useEffect(() => {
    if (currentUser?.user_type === USER_TYPE.OPS) {
      router.replace("/guard/unauthorized");
    }
  }, [currentUser, router]);

  if (currentUser === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Skeleton className="h-10 w-48 rounded-lg" />
      </div>
    );
  }

  if (!canLoadSchedule) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Calendar className="size-5 text-indigo-500" />
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
        </div>
        <form action={signOutAction}>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="h-9 border-red-200 px-3 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <span className="inline-flex items-center gap-1.5">
              <LogOut className="size-4" />
              <span>{t("signOut")}</span>
            </span>
          </Button>
        </form>
      </div>

      {schedule === undefined ? (
        <div className="space-y-4">
          {SKELETON_KEYS.map((skeletonKey) => (
            <div key={skeletonKey} className="space-y-2">
              <Skeleton className="h-5 w-28 rounded" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <GuardShiftList schedule={schedule} />
      )}
    </div>
  );
}
