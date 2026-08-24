"use client";

import { GUARD_TYPE, USER_STATUS, USER_TYPE } from "../../../lib/constants";
import { formatPhoneDisplay } from "../../../lib/validators";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { GuardPhotoUpload } from "./GuardPhotoUpload";

type GuardProfileCardProps = {
  name: string;
  phone: string | undefined;
  status: string;
  userType: string | undefined;
  guardType: string;
  societyName: string | null;
  photoUrl: string | null | undefined;
  canEditPhoto?: boolean;
};

export function GuardProfileCard({
  name,
  phone,
  status,
  userType,
  guardType,
  societyName,
  photoUrl,
  canEditPhoto = true,
}: GuardProfileCardProps) {
  const t = useTranslations("guard.profile");
  const tDashboard = useTranslations("guard.dashboard");
  const tLeads = useTranslations("guard.leads");
  const tStatus = useTranslations("guard.status");

  function getGuardTypeLabel(type: string): string {
    switch (type) {
      case GUARD_TYPE.BUILDING_SPECIFIC:
        return t("guardType.buildingSpecific");
      case GUARD_TYPE.MAIN_GATE:
        return t("guardType.mainGate");
      case GUARD_TYPE.PARK:
        return t("guardType.park");
      case GUARD_TYPE.ROVING:
        return t("guardType.roving");
      default:
        return type;
    }
  }

  function getRoleLabel(): string {
    if (userType === USER_TYPE.OPS) {
      return "OPS";
    }

    return getGuardTypeLabel(guardType);
  }

  const isActive = status === USER_STATUS.ACTIVE;
  const statusLabel = tStatus(isActive ? "ACTIVE" : "INACTIVE");
  const statusHeading = tLeads("statusHistory").split(" ")[0];
  const statusDotClass = isActive ? "bg-emerald-500" : "bg-slate-400";
  const roleHeading = userType === USER_TYPE.OPS ? "Role" : "Type";

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
      <div className="h-20 bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900" />

      <CardContent className="-mt-14 flex flex-col items-center gap-4 px-6 pb-6">
        <GuardPhotoUpload photoUrl={photoUrl} guardName={name} allowUpload={canEditPhoto} />

        <div className="flex flex-col items-center gap-1 text-center">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{name}</h2>
          {phone && (
            <p className="font-mono text-base text-slate-500">{formatPhoneDisplay(phone)}</p>
          )}
        </div>

        <div className="flex w-full flex-col gap-2.5 rounded-xl bg-slate-50 px-4 py-3">
          {societyName && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">
                {tDashboard("societyLabel")}
              </span>
              <span className="text-sm font-semibold text-slate-900">{societyName}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">{roleHeading}</span>
            <span className="text-sm font-semibold text-slate-900">{getRoleLabel()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">{statusHeading}</span>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <span className={`inline-block size-2 rounded-full ${statusDotClass}`} />
              {statusLabel}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
