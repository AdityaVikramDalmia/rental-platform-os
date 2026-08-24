"use client";

import { ChevronRight, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  VISIT_OUTCOME,
  VISIT_STATUS,
  type VisitOutcome,
  type VisitStatus,
} from "../../../../../../lib/constants";
import { VisitStatusBadge } from "@/components/shared/visit-status-badge";

const IST_TZ = "Asia/Kolkata";
const IST_TIME_FORMAT = {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: IST_TZ,
} as const;

type VisitCardProps = {
  id: string;
  buildingName: string | undefined;
  floorNumber: string | undefined;
  flatNumber: string | undefined;
  societyName: string | undefined;
  scheduledStart: number;
  scheduledEnd: number;
  status: VisitStatus;
  outcome?: VisitOutcome;
  isToday?: boolean;
};

export function VisitCard({
  id,
  buildingName,
  floorNumber,
  flatNumber,
  societyName,
  scheduledStart,
  scheduledEnd,
  status,
  outcome,
  isToday,
}: VisitCardProps) {
  const t = useTranslations("guard.visits");
  const tStatus = useTranslations("guard.status");
  const tSubmitLead = useTranslations("guard.submitLead");
  const tCommon = useTranslations("guard.common");
  const format = useFormatter();

  const outcomeMap: Record<VisitOutcome, { emoji: string; label: string }> = {
    [VISIT_OUTCOME.INTERESTED]: { emoji: "😊", label: t("interested") },
    [VISIT_OUTCOME.NOT_INTERESTED]: { emoji: "😐", label: t("notInterested") },
    [VISIT_OUTCOME.FOLLOWUP]: { emoji: "🔄", label: t("followUp") },
  };

  const outcomeDisplay = outcome ? outcomeMap[outcome] : undefined;
  const showCTA =
    status === VISIT_STATUS.ASSIGNED ||
    status === VISIT_STATUS.CONFIRMED ||
    status === VISIT_STATUS.IN_PROGRESS;
  const ctaLabel = status === VISIT_STATUS.IN_PROGRESS ? t("completeVisit") : t("startVisit");

  const startDate = new Date(scheduledStart);
  const startTime = format.dateTime(startDate, IST_TIME_FORMAT);
  const endTime = format.dateTime(new Date(scheduledEnd), IST_TIME_FORMAT);
  const visitTime = isToday
    ? t("todayTime", { date: `${startTime} – ${endTime}` })
    : t("dateTime", { date: `${format.dateTime(startDate, "short")}, ${startTime}` });

  const locationText = [
    buildingName ?? tCommon("noData"),
    floorNumber ? `${tSubmitLead("floor")} ${floorNumber}` : null,
    flatNumber ? `#${flatNumber}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={`/guard/visits/${id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow active:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between">
        <div className="flex-1 pr-2">
          <p className="text-base font-semibold text-slate-900">{locationText}</p>
          {societyName && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
              <MapPin className="size-3.5 shrink-0" />
              {societyName}
            </p>
          )}
        </div>
        <VisitStatusBadge status={status} label={tStatus(status)} />
      </div>

      <div className="mb-2 flex items-center gap-1.5 text-sm text-slate-500">
        <Clock className="size-3.5 shrink-0" />
        <span>{visitTime}</span>
      </div>

      {outcomeDisplay && status === VISIT_STATUS.COMPLETED && (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5">
          <span className="text-base">{outcomeDisplay.emoji}</span>
          <span className="text-sm font-medium text-slate-700">{outcomeDisplay.label}</span>
        </div>
      )}

      {showCTA && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-900 px-3.5 py-2.5">
          <span className="text-sm font-semibold text-white">{ctaLabel}</span>
          <ChevronRight className="size-4 text-white/70" />
        </div>
      )}
    </Link>
  );
}
