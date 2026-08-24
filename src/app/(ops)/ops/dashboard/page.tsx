"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import {
  Banknote,
  Calendar,
  ClipboardList,
  FileCheck,
  FileText,
  FolderOpen,
  LayoutDashboard,
} from "lucide-react";
import { useMemo } from "react";
import { api } from "../../../../../convex/_generated/api";
import {
  CLOSURE_STATUS,
  COMMISSION_BOUNDS,
  INCENTIVE_PERSONA,
  LEAD_STATUS,
} from "../../../../../lib/constants";
import {
  CommissionTransparencyCard,
  type CommissionTransparencyData,
} from "@/components/ops/CommissionTransparencyCard";
import { NavCard } from "@/components/ops/nav-card";
import { StatCard } from "@/components/ops/stat-card";
import { AttributionEarningsCard } from "@/components/shared/AttributionEarningsCard";
import { GamificationProfileCard } from "@/components/shared/GamificationProfileCard";

function parseCommissionModifiers(configJson: string): Array<{
  name: string;
  reward_mode: "BPS" | "FLAT_PAISE";
  delta_bps?: number;
  delta_paise?: number;
  passed: boolean;
}> {
  try {
    const parsed = JSON.parse(configJson) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return [];
    }

    const commission =
      typeof (parsed as Record<string, unknown>).commission === "object" &&
      (parsed as Record<string, unknown>).commission !== null &&
      !Array.isArray((parsed as Record<string, unknown>).commission)
        ? ((parsed as Record<string, unknown>).commission as Record<string, unknown>)
        : {};

    const modifiers = Array.isArray(commission.modifiers) ? commission.modifiers : [];
    return modifiers.slice(0, 5).map((modifier, index) => {
      const raw =
        typeof modifier === "object" && modifier !== null
          ? (modifier as Record<string, unknown>)
          : {};

      const rewardMode = raw.reward_mode === "FLAT_PAISE" ? "FLAT_PAISE" : "BPS";
      const deltaValue =
        typeof raw.delta_value === "number"
          ? raw.delta_value
          : typeof raw.delta_bps === "number"
            ? raw.delta_bps
            : typeof raw.delta_paise === "number"
              ? raw.delta_paise
              : 0;

      return {
        name:
          typeof raw.display_name === "string"
            ? raw.display_name
            : typeof raw.name === "string"
              ? raw.name
              : typeof raw.code === "string"
                ? raw.code
                : `Modifier ${index + 1}`,
        reward_mode: rewardMode,
        delta_bps: rewardMode === "BPS" ? deltaValue : undefined,
        delta_paise: rewardMode === "FLAT_PAISE" ? deltaValue : undefined,
        passed: raw.is_active === false ? false : true,
      };
    });
  } catch {
    return [];
  }
}

function buildPlaceholderCommissionData(params: {
  baseRateBps: number;
  configJson: string | undefined;
}): CommissionTransparencyData {
  const modifiers = parseCommissionModifiers(params.configJson ?? "{}");
  const deltaBps = modifiers.reduce((total, modifier) => {
    if (!modifier.passed || modifier.reward_mode !== "BPS") {
      return total;
    }

    return total + (modifier.delta_bps ?? 0);
  }, 0);
  const flatBonusTotalPaise = modifiers.reduce((total, modifier) => {
    if (!modifier.passed || modifier.reward_mode !== "FLAT_PAISE") {
      return total;
    }

    return total + (modifier.delta_paise ?? 0);
  }, 0);
  const effectiveRateBps = Math.max(
    0,
    Math.min(params.baseRateBps + deltaBps, COMMISSION_BOUNDS.DEFAULT_MAX_BPS),
  );
  const sampleProfitPaise = 1_200_000;
  const estimatedPoolPaise =
    Math.floor((sampleProfitPaise * effectiveRateBps) / 10000) + flatBonusTotalPaise;

  return {
    base_rate_bps: params.baseRateBps,
    effective_rate_bps: effectiveRateBps,
    flat_bonus_total_paise: flatBonusTotalPaise,
    estimated_pool_paise: estimatedPoolPaise,
    limited_data: true,
    limited_data_reason:
      "Showing config-based estimate until commission evaluations are available.",
    modifiers,
  };
}

export default function OpsDashboardPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const todaysVisits = useQuery(api.visits.getTodayCount);
  const leadCounts = useQuery(api.leads.getStatusCounts, {});
  const activeConfigVersion = useQuery(api.incentiveConfig.getActive);
  const opsPersonaProfile = useQuery(
    api.incentiveActors.getActiveProfile,
    currentUser
      ? {
          user_id: currentUser._id,
          persona: INCENTIVE_PERSONA.OPS,
        }
      : "skip",
  );
  const { results: pendingClosures, status: pendingClosuresStatus } = usePaginatedQuery(
    api.closures.list,
    { status: CLOSURE_STATUS.PENDING },
    { initialNumItems: 50 },
  );

  const pendingLeads = leadCounts?.[LEAD_STATUS.SUBMITTED];
  const needsInfoLeads = leadCounts?.[LEAD_STATUS.NEED_INFO];
  const pendingClosuresValue =
    pendingClosuresStatus === "LoadingFirstPage"
      ? undefined
      : pendingClosuresStatus === "CanLoadMore"
        ? `${pendingClosures.length}+`
        : pendingClosures.length;
  const commissionData = useMemo(() => {
    if (!opsPersonaProfile) {
      return null;
    }

    const baseRate = opsPersonaProfile.commission_base_bps ?? COMMISSION_BOUNDS.DEFAULT_BASE_BPS;

    return buildPlaceholderCommissionData({
      baseRateBps: baseRate,
      configJson: activeConfigVersion?.config_json,
    });
  }, [activeConfigVersion?.config_json, opsPersonaProfile]);

  return (
    <div className="space-y-5 text-base">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="text-sm text-slate-500">OPS Operations Center</p>
      </div>

      {opsPersonaProfile === undefined ? (
        <CommissionTransparencyCard data={null} isLoading />
      ) : opsPersonaProfile ? (
        <CommissionTransparencyCard data={commissionData} />
      ) : null}

      <AttributionEarningsCard />

      <GamificationProfileCard />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Quick Stats
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            href="/ops/visits"
            label="Today's Visits"
            value={todaysVisits}
            icon={Calendar}
            iconBackgroundClassName="bg-emerald-100"
            iconClassName="text-emerald-700"
            isLoading={todaysVisits === undefined}
          />
          <StatCard
            href="/ops/leads"
            label="Pending Leads"
            value={pendingLeads}
            icon={FileText}
            iconBackgroundClassName="bg-blue-100"
            iconClassName="text-blue-700"
            isLoading={leadCounts === undefined}
          />
          <StatCard
            href="/ops/leads"
            label="Need Info"
            value={needsInfoLeads}
            icon={LayoutDashboard}
            iconBackgroundClassName="bg-amber-100"
            iconClassName="text-amber-700"
            isLoading={leadCounts === undefined}
          />
          <StatCard
            href="/ops/closures"
            label="Pending Closures"
            value={pendingClosuresValue}
            icon={FileCheck}
            iconBackgroundClassName="bg-violet-100"
            iconClassName="text-violet-700"
            isLoading={pendingClosuresStatus === "LoadingFirstPage"}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <NavCard
            title="Leads"
            description="Triage & verify"
            href="/ops/leads"
            icon={FileText}
            borderClassName="border-l-blue-500"
            iconBackgroundClassName="bg-blue-100"
            iconClassName="text-blue-700"
          />
          <NavCard
            title="Visits"
            description="Schedule & manage"
            href="/ops/visits"
            icon={Calendar}
            borderClassName="border-l-emerald-500"
            iconBackgroundClassName="bg-emerald-100"
            iconClassName="text-emerald-700"
          />
          <NavCard
            title="Closures"
            description="Track deals"
            href="/ops/closures"
            icon={FileCheck}
            borderClassName="border-l-violet-500"
            iconBackgroundClassName="bg-violet-100"
            iconClassName="text-violet-700"
          />
          <NavCard
            title="Handover"
            description="Move-in checklist"
            href="/ops/handover"
            icon={ClipboardList}
            borderClassName="border-l-amber-500"
            iconBackgroundClassName="bg-amber-100"
            iconClassName="text-amber-700"
          />
          <NavCard
            title="Documents"
            description="Collect & verify"
            href="/ops/documents"
            icon={FolderOpen}
            borderClassName="border-l-rose-500"
            iconBackgroundClassName="bg-rose-100"
            iconClassName="text-rose-700"
          />
          <NavCard
            title="Earnings"
            description="Track payouts"
            href="/ops/more"
            icon={Banknote}
            borderClassName="border-l-emerald-600"
            iconBackgroundClassName="bg-emerald-100"
            iconClassName="text-emerald-700"
            disabled
            badgeLabel="Soon"
          />
        </div>
      </section>
    </div>
  );
}
