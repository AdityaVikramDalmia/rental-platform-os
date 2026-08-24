"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, Calendar, Clock, Loader2, MapPin } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  isFieldWorkerUserType,
  VISIT_OUTCOME,
  VISIT_STATUS,
  type VisitOutcome,
  type VisitStatus,
} from "../../../../../../lib/constants";
import { VisitStatusBadge } from "@/components/shared/visit-status-badge";
import { ChecklistExecution } from "../components/checklist-execution";
import { VisitExecution } from "../components/visit-execution";

const IST_TZ = "Asia/Kolkata";
export default function VisitDetailPage() {
  const t = useTranslations("guard.visits");
  const tStatus = useTranslations("guard.status");
  const tSubmitLead = useTranslations("guard.submitLead");
  const tCommon = useTranslations("guard.common");
  const format = useFormatter();
  const params = useParams();
  const visitId = params.id as string;
  const currentUser = useQuery(api.users.getCurrentUser);
  const isFieldWorkerActive =
    currentUser !== null &&
    isFieldWorkerUserType(currentUser?.user_type) &&
    currentUser.status === "ACTIVE";

  const visits = useQuery(api.visits.getMyGuardVisits, isFieldWorkerActive ? {} : "skip");
  const checklist = useQuery(
    api.checklists.getByVisitId,
    isFieldWorkerActive ? { visit_id: visitId as Id<"visits"> } : "skip",
  );

  const visit = useMemo(() => {
    if (!visits) return undefined;
    return visits.find((v) => String(v._id) === visitId) ?? null;
  }, [visits, visitId]);

  const outcomeMap: Record<VisitOutcome, { emoji: string; label: string }> = {
    [VISIT_OUTCOME.INTERESTED]: { emoji: "😊", label: t("interested") },
    [VISIT_OUTCOME.NOT_INTERESTED]: { emoji: "😐", label: t("notInterested") },
    [VISIT_OUTCOME.FOLLOWUP]: { emoji: "🔄", label: t("followUp") },
  };

  function formatSchedule(start: number, end: number): string {
    const startDate = new Date(start);
    const startText = `${format.dateTime(startDate, "short")}, ${format.dateTime(startDate, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: IST_TZ,
    })}`;
    const endText = format.dateTime(new Date(end), {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: IST_TZ,
    });
    return `${startText} – ${endText}`;
  }

  function formatDateTime(ms: number): string {
    const date = new Date(ms);
    return `${format.dateTime(date, "short")}, ${format.dateTime(date, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: IST_TZ,
    })}`;
  }

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
        <Link
          href="/guard/visits"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" />
          {t("title")}
        </Link>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-base font-medium text-amber-900">
          {t("inactive")}
        </div>
      </div>
    );
  }

  if (visits === undefined) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-7 animate-spin text-slate-400" />
      </div>
    );
  }

  if (visit === null || visit === undefined) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-base font-medium text-slate-600">{t("visitNotFound")}</p>
        <Link href="/guard/visits" className="text-sm font-semibold text-slate-500 underline">
          {t("backToVisits")}
        </Link>
      </div>
    );
  }

  const locationText = [
    visit.building?.name ?? tCommon("noData"),
    visit.lead?.floor_number ? `${tSubmitLead("floor")} ${visit.lead.floor_number}` : null,
    visit.lead?.flat_number ? `#${visit.lead.flat_number}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const outcomeDisplay = visit.outcome ? outcomeMap[visit.outcome as VisitOutcome] : undefined;

  const isTerminal =
    visit.status === VISIT_STATUS.COMPLETED ||
    visit.status === VISIT_STATUS.CANCELLED ||
    visit.status === VISIT_STATUS.NO_SHOW;

  return (
    <div className="space-y-4">
      <Link
        href="/guard/visits"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <VisitStatusBadge
            status={visit.status as VisitStatus}
            label={tStatus(visit.status)}
            size="md"
          />
        </div>
        <p className="text-lg font-bold text-slate-900">{locationText}</p>
        {visit.society?.name && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <MapPin className="size-4 shrink-0" />
            {visit.society.name}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          <Calendar className="size-4" />
          {t("schedule")}
        </h3>
        <p className="text-base font-medium text-slate-900">
          {formatSchedule(visit.scheduled_start, visit.scheduled_end)}
        </p>
      </div>

      {visit.started_at !== undefined && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            <Clock className="size-4" />
            {t("started")}
          </h3>
          <p className="text-base font-medium text-slate-900">{formatDateTime(visit.started_at)}</p>
        </div>
      )}

      {visit.completed_at !== undefined && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            {t("completed")}
          </h3>
          <p className="mb-3 text-base font-medium text-slate-900">
            {formatDateTime(visit.completed_at)}
          </p>
          {outcomeDisplay && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-xl">{outcomeDisplay.emoji}</span>
              <span className="text-base font-semibold text-slate-800">{outcomeDisplay.label}</span>
            </div>
          )}
          {visit.outcome_notes && (
            <div className="mt-2 rounded-lg bg-slate-50 p-3">
              <p className="text-sm text-slate-600">{visit.outcome_notes}</p>
            </div>
          )}
        </div>
      )}

      {checklist && <ChecklistExecution checklistId={checklist._id} />}

      {!isTerminal && (
        <VisitExecution
          visitId={visitId as Id<"visits">}
          status={visit.status as VisitStatus}
          checklistInstanceId={visit.checklist_instance_id}
          checklistStatus={checklist?.status}
        />
      )}
    </div>
  );
}
