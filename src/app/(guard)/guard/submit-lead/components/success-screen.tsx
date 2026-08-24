"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LEAD_STATUS } from "../../../../../../lib/constants";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";
import { Button } from "@/components/ui/button";

type SuccessScreenProps = {
  leadId: string;
  status: string;
  buildingName: string;
  floorNumber: string;
  flatNumber: string;
  onSubmitAnother: () => void;
};

export function SuccessScreen({
  leadId,
  status,
  buildingName,
  floorNumber,
  flatNumber,
  onSubmitAnother,
}: SuccessScreenProps) {
  const t = useTranslations("guard.submitLead");
  const tLeads = useTranslations("guard.leads");
  const isPotentialDuplicate = status === LEAD_STATUS.POTENTIAL_DUPLICATE;
  const shortId = leadId.slice(0, 8);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 text-center">
      {isPotentialDuplicate && (
        <div className="w-full rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3">
          <p className="text-sm font-semibold text-yellow-800">{t("duplicateWarning")}</p>
        </div>
      )}

      <div className="space-y-3">
        <CheckCircle2 className="mx-auto size-16 text-emerald-500" />
        <h2 className="text-2xl font-bold text-slate-900">{t("success")}</h2>
      </div>

      <div className="w-full rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-sm text-slate-500">#{shortId}</span>
          <LeadStatusBadge status={status} />
        </div>
        <p className="text-lg font-semibold text-slate-900">
          {tLeads("buildingFloor", { building: buildingName || t("building"), floor: floorNumber })}
          , #{flatNumber}
        </p>
        <p className="mt-2 text-sm text-slate-500">{t("successDetail")}</p>
      </div>

      <div className="flex w-full gap-3">
        <Button
          variant="outline"
          onClick={onSubmitAnother}
          className="h-12 flex-1 rounded-xl border-slate-300 text-base font-semibold"
        >
          {t("submitAnother")}
        </Button>
        <Button asChild className="h-12 flex-1 rounded-xl bg-slate-900 text-base font-semibold">
          <Link href="/guard/leads">{t("viewMyLeads")}</Link>
        </Button>
      </div>
    </div>
  );
}
