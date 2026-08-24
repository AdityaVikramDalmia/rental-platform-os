"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { LeadForm } from "./components/lead-form";
import { RateLimitScreen } from "./components/rate-limit-screen";
import { SuccessScreen } from "./components/success-screen";

type PageState = "FORM" | "SUCCESS" | "RATE_LIMITED";

type SuccessData = {
  leadId: string;
  status: string;
  buildingName: string;
  floorNumber: string;
  flatNumber: string;
};

export default function SubmitLeadPage() {
  const t = useTranslations("guard.submitLead");
  const [pageState, setPageState] = useState<PageState>("FORM");
  const [successData, setSuccessData] = useState<SuccessData | null>(null);

  const guardProfile = useQuery(api.guards.getMyProfile);
  const shouldLoadBuildings =
    guardProfile?.society_id !== undefined && guardProfile.status === "ACTIVE";
  const remainingLeads = useQuery(api.guards.getRemainingLeads);
  const buildings = useQuery(
    api.buildings.listBySocietyForGuard,
    shouldLoadBuildings ? { society_id: guardProfile.society_id } : "skip",
  );

  const isLoading = guardProfile === undefined || (shouldLoadBuildings && buildings === undefined);
  const isInactiveGuard = guardProfile?.status === "INACTIVE";
  const isLimitReached = remainingLeads !== undefined && remainingLeads.remaining === 0;

  const handleSuccess = useCallback(
    (leadId: Id<"leads">, status: string, buildingName: string, floor: string, flat: string) => {
      setSuccessData({
        leadId: String(leadId),
        status,
        buildingName,
        floorNumber: floor,
        flatNumber: flat,
      });
      setPageState("SUCCESS");
    },
    [],
  );

  const handleRateLimited = useCallback(() => {
    setPageState("RATE_LIMITED");
  }, []);

  const handleSubmitAnother = useCallback(() => {
    setSuccessData(null);
    setPageState("FORM");
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!guardProfile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-base text-slate-500">{t("guardNotFound")}</p>
      </div>
    );
  }

  if (isLimitReached && pageState === "FORM" && !isInactiveGuard) {
    return (
      <RateLimitScreen
        count={remainingLeads?.submitted_today}
        limit={remainingLeads?.limit}
        message={t("limitReached")}
      />
    );
  }

  if (pageState === "RATE_LIMITED") {
    return (
      <RateLimitScreen
        count={remainingLeads?.submitted_today}
        limit={remainingLeads?.limit}
        message={t("limitReached")}
      />
    );
  }

  if (pageState === "SUCCESS" && successData) {
    return (
      <SuccessScreen
        leadId={successData.leadId}
        status={successData.status}
        buildingName={successData.buildingName}
        floorNumber={successData.floorNumber}
        flatNumber={successData.flatNumber}
        onSubmitAnother={handleSubmitAnother}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
        {remainingLeads === undefined ? (
          <p className="text-sm text-slate-400">{t("loadingCount")}</p>
        ) : (
          <p className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
            {t("remaining", {
              count: remainingLeads.submitted_today,
              max: remainingLeads.limit,
            })}
          </p>
        )}
      </div>

      <LeadForm
        societyId={guardProfile.society_id}
        buildings={buildings ?? []}
        remainingLeads={remainingLeads}
        isDisabled={isInactiveGuard}
        disabledMessage={t("inactive")}
        onSuccess={handleSuccess}
        onRateLimited={handleRateLimited}
      />
    </div>
  );
}
