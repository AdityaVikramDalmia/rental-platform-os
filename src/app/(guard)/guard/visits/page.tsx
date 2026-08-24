"use client";

import { useQuery } from "convex/react";
import { Calendar, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import {
  isFieldWorkerUserType,
  VISIT_STATUS,
  type VisitOutcome,
  type VisitStatus,
} from "../../../../../lib/constants";
import { VisitCard } from "./components/visit-card";
import { VisitSection } from "./components/visit-section";

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

function getStartOfDayIST(ms: number): number {
  const istMs = ms + IST_OFFSET_MS;
  const dayStart = Math.floor(istMs / DAY_MS) * DAY_MS;
  return dayStart - IST_OFFSET_MS;
}

function isTerminalStatus(status: string): boolean {
  return (
    status === VISIT_STATUS.COMPLETED ||
    status === VISIT_STATUS.CANCELLED ||
    status === VISIT_STATUS.NO_SHOW
  );
}

export default function GuardVisitsPage() {
  const t = useTranslations("guard.visits");
  const [dateFrom] = useState(() => Date.now() - 30 * DAY_MS);
  const [now] = useState(() => Date.now());
  const currentUser = useQuery(api.users.getCurrentUser);
  const isFieldWorkerActive =
    currentUser !== null &&
    isFieldWorkerUserType(currentUser?.user_type) &&
    currentUser.status === "ACTIVE";

  const visits = useQuery(
    api.visits.getMyGuardVisits,
    isFieldWorkerActive ? { date_from: dateFrom } : "skip",
  );

  const { today, upcoming, past } = useMemo(() => {
    if (!visits) return { today: [], upcoming: [], past: [] };

    const todayStart = getStartOfDayIST(now);
    const tomorrowStart = todayStart + DAY_MS;
    const sevenDaysOut = todayStart + 8 * DAY_MS;

    const todayVisits: Array<(typeof visits)[number]> = [];
    const upcomingVisits: Array<(typeof visits)[number]> = [];
    const pastVisits: Array<(typeof visits)[number]> = [];

    for (const visit of visits) {
      const visitDayStart = getStartOfDayIST(visit.scheduled_start);

      if (isTerminalStatus(visit.status)) {
        pastVisits.push(visit);
      } else if (visitDayStart >= todayStart && visitDayStart < tomorrowStart) {
        todayVisits.push(visit);
      } else if (visitDayStart >= tomorrowStart && visitDayStart < sevenDaysOut) {
        upcomingVisits.push(visit);
      } else if (visitDayStart < todayStart) {
        pastVisits.push(visit);
      } else {
        upcomingVisits.push(visit);
      }
    }

    todayVisits.sort((a, b) => a.scheduled_start - b.scheduled_start);
    upcomingVisits.sort((a, b) => a.scheduled_start - b.scheduled_start);
    pastVisits.sort((a, b) => b.scheduled_start - a.scheduled_start);

    return { today: todayVisits, upcoming: upcomingVisits, past: pastVisits };
  }, [visits, now]);

  const hasAnyVisits = today.length > 0 || upcoming.length > 0 || past.length > 0;

  if (currentUser === undefined) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-7 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!currentUser || !isFieldWorkerUserType(currentUser.user_type)) {
    return null;
  }

  if (currentUser.status === "INACTIVE") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="size-5 text-slate-700" />
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-base font-medium text-amber-900">
          {t("inactive")}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Calendar className="size-5 text-slate-700" />
        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
      </div>

      {visits === undefined && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-7 animate-spin text-slate-400" />
        </div>
      )}

      {visits !== undefined && !hasAnyVisits && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="rounded-full bg-slate-100 p-4">
            <Calendar className="size-8 text-slate-400" />
          </div>
          <p className="text-base font-medium text-slate-600">{t("noVisits")}</p>
          <p className="text-sm text-slate-400">{t("noVisitsDetail")}</p>
        </div>
      )}

      {visits !== undefined && hasAnyVisits && (
        <>
          <VisitSection title={t("today")} count={today.length} highlighted>
            {today.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">{t("noToday")}</p>
            ) : (
              today.map((visit) => (
                <VisitCard
                  key={String(visit._id)}
                  id={String(visit._id)}
                  buildingName={visit.building?.name}
                  floorNumber={visit.lead?.floor_number}
                  flatNumber={visit.lead?.flat_number}
                  societyName={visit.society?.name}
                  scheduledStart={visit.scheduled_start}
                  scheduledEnd={visit.scheduled_end}
                  status={visit.status as VisitStatus}
                  outcome={visit.outcome as VisitOutcome | undefined}
                  isToday
                />
              ))
            )}
          </VisitSection>

          {upcoming.length > 0 && (
            <VisitSection title={t("upcoming")} count={upcoming.length}>
              {upcoming.map((visit) => (
                <VisitCard
                  key={String(visit._id)}
                  id={String(visit._id)}
                  buildingName={visit.building?.name}
                  floorNumber={visit.lead?.floor_number}
                  flatNumber={visit.lead?.flat_number}
                  societyName={visit.society?.name}
                  scheduledStart={visit.scheduled_start}
                  scheduledEnd={visit.scheduled_end}
                  status={visit.status as VisitStatus}
                  outcome={visit.outcome as VisitOutcome | undefined}
                />
              ))}
            </VisitSection>
          )}

          {past.length > 0 && (
            <VisitSection
              title={t("past")}
              count={past.length}
              collapsible
              defaultCollapsed={past.length > 5}
            >
              {past.map((visit) => (
                <VisitCard
                  key={String(visit._id)}
                  id={String(visit._id)}
                  buildingName={visit.building?.name}
                  floorNumber={visit.lead?.floor_number}
                  flatNumber={visit.lead?.flat_number}
                  societyName={visit.society?.name}
                  scheduledStart={visit.scheduled_start}
                  scheduledEnd={visit.scheduled_end}
                  status={visit.status as VisitStatus}
                  outcome={visit.outcome as VisitOutcome | undefined}
                />
              ))}
            </VisitSection>
          )}
        </>
      )}
    </div>
  );
}
