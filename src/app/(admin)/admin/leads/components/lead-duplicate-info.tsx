"use client";

import { AlertTriangle, Copy, Flag } from "lucide-react";
import { QUALITY_FLAGS } from "../../../../../../lib/constants";
import { formatRelativeTime } from "../../../../../../lib/dates";
import { Button } from "@/components/ui/button";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";

type DuplicateLeadRef = {
  lead_id: string;
  flat_number: string;
  status: string;
  created_at: number;
};

type LeadDuplicateInfoProps = {
  qualityFlags: string[];
  duplicateLead: DuplicateLeadRef | null;
  onMarkDuplicate: () => void;
  onClearFlag: () => void;
  canMarkDuplicate: boolean;
};

export function LeadDuplicateInfo({
  qualityFlags,
  duplicateLead,
  onMarkDuplicate,
  onClearFlag,
  canMarkDuplicate,
}: LeadDuplicateInfoProps) {
  const hasFlatMatch = qualityFlags.includes(QUALITY_FLAGS.DUPLICATE_FLAT_MATCH);
  const hasPhoneMatch = qualityFlags.includes(QUALITY_FLAGS.DUPLICATE_PHONE_MATCH);

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-amber-600" />
        <p className="text-sm font-semibold text-amber-800">Potential Duplicate</p>
      </div>

      <div className="space-y-1.5 text-xs text-amber-700">
        {hasFlatMatch && (
          <div className="flex items-center gap-1.5">
            <Copy className="size-3" />
            Same flat submitted within 90 days
          </div>
        )}
        {hasPhoneMatch && (
          <div className="flex items-center gap-1.5">
            <Flag className="size-3" />
            Same owner phone in this society within 30 days
          </div>
        )}
      </div>

      {duplicateLead && (
        <div className="rounded-md border border-amber-200 bg-white/60 p-2.5">
          <p className="text-xs text-amber-600">Matches existing lead:</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm font-medium text-slate-900">
              Flat {duplicateLead.flat_number}
            </span>
            <LeadStatusBadge status={duplicateLead.status} size="sm" />
            <span className="text-xs text-slate-400">
              {formatRelativeTime(duplicateLead.created_at)}
            </span>
          </div>
        </div>
      )}

      {canMarkDuplicate && (
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={onMarkDuplicate}
            className="h-8 text-xs"
          >
            Mark Duplicate
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onClearFlag}
            className="h-8 border-amber-300 text-xs text-amber-800 hover:bg-amber-100"
          >
            Not a Duplicate
          </Button>
        </div>
      )}
    </div>
  );
}
