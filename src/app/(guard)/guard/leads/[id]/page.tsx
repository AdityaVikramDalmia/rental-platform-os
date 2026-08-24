"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, Banknote, Home, Loader2, Phone, Sofa } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { AVAILABILITY_TYPE, FURNISHING, LEAD_STATUS } from "../../../../../../lib/constants";
import { paiseToRupees } from "../../../../../../lib/money";
import { formatPhoneDisplay } from "../../../../../../lib/validators";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";
import { NotesThread } from "@/components/shared/notes-thread";
import { StatusTimeline } from "@/components/shared/status-timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { NeedInfoForm } from "../components/need-info-form";

export default function LeadDetailPage() {
  const t = useTranslations("guard.leads");
  const tSubmitLead = useTranslations("guard.submitLead");
  const format = useFormatter();
  const params = useParams();
  const leadId = params.id as string;

  const furnishingLabels: Record<string, string> = {
    [FURNISHING.UNFURNISHED]: t("unfurnished"),
    [FURNISHING.SEMI_FURNISHED]: t("semi"),
    [FURNISHING.FULLY_FURNISHED]: t("fully"),
  };

  const availabilityLabels: Record<string, string> = {
    [AVAILABILITY_TYPE.VACANT_NOW]: t("vacantNow"),
    [AVAILABILITY_TYPE.VACANT_FROM]: t("vacantFrom"),
  };

  const lead = useQuery(api.leads.getMyLeadById, {
    lead_id: leadId as Id<"leads">,
  });

  const timelineEntries = useMemo(() => {
    if (!lead) return [];

    const entries = [
      {
        status:
          lead.status === LEAD_STATUS.POTENTIAL_DUPLICATE ? "POTENTIAL_DUPLICATE" : "SUBMITTED",
        label:
          lead.status === LEAD_STATUS.POTENTIAL_DUPLICATE
            ? t("flaggedDuplicate")
            : t("leadSubmitted"),
        timestamp: lead._creationTime,
        isCurrent: false,
      },
    ];

    const notesThread = lead.notes_thread ?? [];
    for (const note of notesThread) {
      if (note.author_type === "ADMIN") {
        entries.push({
          status: "NEED_INFO",
          label: t("adminRequestedInfo"),
          timestamp: note.timestamp,
          isCurrent: false,
        });
      } else {
        entries.push({
          status: "SUBMITTED",
          label: t("guardResubmitted"),
          timestamp: note.timestamp,
          isCurrent: false,
        });
      }
    }

    if (entries.length > 0) {
      entries[entries.length - 1].isCurrent = true;
    }

    return entries;
  }, [lead, t]);

  if (lead === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32 rounded" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-base font-medium text-slate-600">{t("leadNotFound")}</p>
        <Link href="/guard/leads" className="text-sm font-semibold text-slate-500 underline">
          {t("backToLeads")}
        </Link>
      </div>
    );
  }

  const showBounty = lead.status === LEAD_STATUS.VERIFIED && lead.prospective_bounty !== undefined;

  return (
    <div className="space-y-4">
      <Link
        href="/guard/leads"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-4" />
        {t("backToLeads")}
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <LeadStatusBadge status={lead.status} size="md" />
          <span className="text-xs text-slate-400">
            {format.relativeTime(new Date(lead._creationTime))}
          </span>
        </div>
        <p className="text-lg font-bold text-slate-900">
          {t("buildingFloor", {
            building: lead.building_name ?? tSubmitLead("building"),
            floor: lead.floor_number,
          })}
          / #{lead.flat_number}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          <Phone className="size-4" />
          {t("ownerInfo")}
        </h3>
        <div className="space-y-2">
          {lead.owner_name && (
            <p className="text-base font-medium text-slate-900">{lead.owner_name}</p>
          )}
          <a
            href={`tel:+91${lead.owner_phone}`}
            className="inline-flex items-center gap-1.5 text-base font-medium text-blue-600"
          >
            <Phone className="size-4" />
            {formatPhoneDisplay(lead.owner_phone)}
          </a>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          <Home className="size-4" />
          {t("vacancyDetails")}
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">{t("availabilityLabel")}</span>
            <span className="font-medium text-slate-900">
              {availabilityLabels[lead.availability_type] ?? lead.availability_type}
              {lead.availability_type === AVAILABILITY_TYPE.VACANT_FROM &&
                lead.availability_date && (
                  <span className="ml-1 text-slate-500">
                    ({format.dateTime(new Date(lead.availability_date), "short")})
                  </span>
                )}
            </span>
          </div>
          {lead.rent_expected !== undefined && (
            <div className="flex justify-between">
              <span className="text-slate-500">{t("expectedRent")}</span>
              <span className="font-medium text-slate-900">
                {format.number(paiseToRupees(lead.rent_expected), "inr")}
              </span>
            </div>
          )}
          {lead.furnishing && (
            <div className="flex justify-between">
              <span className="text-slate-500">{t("furnishingLabel")}</span>
              <span className="font-medium text-slate-900">
                {furnishingLabels[lead.furnishing] ?? lead.furnishing}
              </span>
            </div>
          )}
          {lead.notes && (
            <div className="mt-2 rounded-lg bg-slate-50 p-3">
              <p className="text-sm text-slate-600">{lead.notes}</p>
            </div>
          )}
        </div>
      </div>

      {lead.status === LEAD_STATUS.NEED_INFO && <NeedInfoForm lead={lead} />}

      {lead.notes_thread.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            {t("notesLabel")}
          </h3>
          <NotesThread notes={lead.notes_thread} />
        </div>
      )}

      {timelineEntries.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            {t("statusHistory")}
          </h3>
          <StatusTimeline entries={timelineEntries} />
        </div>
      )}

      {showBounty && (
        <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <Banknote className="size-5 text-emerald-600" />
            <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-700">
              {t("prospectiveBounty")}
            </h3>
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-800">
            {format.number(paiseToRupees(lead.prospective_bounty!), "inr")}
          </p>
        </div>
      )}
    </div>
  );
}
