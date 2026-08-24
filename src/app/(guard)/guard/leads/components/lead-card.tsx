"use client";

import { AlertTriangle, Phone } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { LEAD_STATUS, QUALITY_FLAGS } from "../../../../../../lib/constants";
import { formatPhoneDisplay } from "../../../../../../lib/validators";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";

type NoteEntry = {
  note: string;
  author_id: string;
  author_name: string;
  author_type: "ADMIN" | "GUARD" | "OPS";
  timestamp: number;
};

type LeadCardProps = {
  id: string;
  buildingName: string | undefined;
  floorNumber: string;
  flatNumber: string;
  ownerPhone: string;
  status: string;
  createdAt: number;
  qualityFlags?: string[];
  notesThread?: NoteEntry[];
};

export function LeadCard({
  id,
  buildingName,
  floorNumber,
  flatNumber,
  ownerPhone,
  status,
  createdAt,
  qualityFlags,
  notesThread,
}: LeadCardProps) {
  const t = useTranslations("guard.leads");
  const tSubmitLead = useTranslations("guard.submitLead");
  const format = useFormatter();

  const hasDuplicateFlag =
    qualityFlags?.includes(QUALITY_FLAGS.DUPLICATE_FLAT_MATCH) ||
    qualityFlags?.includes(QUALITY_FLAGS.DUPLICATE_PHONE_MATCH);

  const latestAdminNote =
    status === LEAD_STATUS.NEED_INFO
      ? notesThread?.filter((n) => n.author_type === "ADMIN").at(-1)
      : undefined;

  const truncatedNote = latestAdminNote
    ? latestAdminNote.note.length > 80
      ? `${latestAdminNote.note.slice(0, 80)}...`
      : latestAdminNote.note
    : undefined;

  return (
    <Link
      href={`/guard/leads/${id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow active:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between">
        <p className="text-base font-semibold text-slate-900">
          {t("buildingFloor", {
            building: buildingName ?? tSubmitLead("building"),
            floor: floorNumber,
          })}
          , #{flatNumber}
        </p>
        <LeadStatusBadge status={status} />
      </div>

      <div className="mb-1.5 flex items-center gap-1.5 text-sm text-slate-500">
        <Phone className="size-3.5" />
        <span>{formatPhoneDisplay(ownerPhone)}</span>
      </div>

      <p className="text-xs text-slate-400">{format.relativeTime(new Date(createdAt))}</p>

      {hasDuplicateFlag && status === LEAD_STATUS.POTENTIAL_DUPLICATE && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-yellow-50 px-2.5 py-1.5">
          <AlertTriangle className="size-3.5 text-yellow-600" />
          <span className="text-xs font-semibold text-yellow-700">{t("potentialDuplicate")}</span>
        </div>
      )}

      {truncatedNote && (
        <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5">
          <p className="text-xs text-amber-700">
            <span className="font-semibold">{t("adminNote")}: </span>
            &ldquo;{truncatedNote}&rdquo;
          </p>
        </div>
      )}
    </Link>
  );
}
