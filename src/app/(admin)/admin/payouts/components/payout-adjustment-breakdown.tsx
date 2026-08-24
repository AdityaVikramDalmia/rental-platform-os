"use client";

import type { Doc } from "../../../../../../convex/_generated/dataModel";
import {
  BONUS_TYPE_LABELS,
  PENALTY_TYPE_LABELS,
  QUALITY_TIER,
} from "../../../../../../lib/constants";
import { formatINR } from "../../../../../../lib/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const IST_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

type PayoutAdjustmentBreakdownProps = {
  adjustment: Doc<"payout_adjustments">;
};

const TIER_BADGE_CLASSNAME: Record<Doc<"payout_adjustments">["quality_tier"], string> = {
  [QUALITY_TIER.BRONZE]: "border-amber-200 bg-amber-50 text-amber-700",
  [QUALITY_TIER.SILVER]: "border-slate-300 bg-slate-100 text-slate-700",
  [QUALITY_TIER.GOLD]: "border-yellow-200 bg-yellow-50 text-yellow-700",
  [QUALITY_TIER.PLATINUM]: "border-cyan-200 bg-cyan-50 text-cyan-700",
};

export function PayoutAdjustmentBreakdown({ adjustment }: PayoutAdjustmentBreakdownProps) {
  const qualityAdjustedAmount = Math.round(
    adjustment.base_amount_paise * adjustment.quality_multiplier,
  );

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-slate-900">
          Payout Adjustment Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-slate-500">Base Amount</p>
            <p className="font-semibold text-slate-900">
              {formatINR(adjustment.base_amount_paise)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-slate-500">Computed At</p>
            <p className="font-medium text-slate-900">
              {IST_DATE_TIME_FORMATTER.format(adjustment.computed_at)}
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <p className="text-slate-600">Quality Score</p>
            <p className="font-semibold text-slate-900">{adjustment.quality_score.toFixed(2)}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-slate-600">Tier</p>
            <Badge variant="outline" className={TIER_BADGE_CLASSNAME[adjustment.quality_tier]}>
              {adjustment.quality_tier}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-slate-600">Multiplier</p>
            <p className="font-semibold text-blue-700">
              {adjustment.quality_multiplier.toFixed(2)}x
            </p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-slate-600">Quality Adjusted Amount</p>
            <p className="font-semibold text-blue-700">{formatINR(qualityAdjustedAmount)}</p>
          </div>
        </div>

        <Separator />

        <div className="space-y-2 text-sm">
          <p className="font-medium text-slate-900">Bonuses</p>
          {adjustment.task_bonuses.length === 0 ? (
            <p className="text-slate-500">No task bonuses applied.</p>
          ) : (
            adjustment.task_bonuses.map((bonus) => (
              <div
                key={`${bonus.bonus_type}-${bonus.label}`}
                className="flex items-center justify-between"
              >
                <p className="text-slate-600">
                  {bonus.label || BONUS_TYPE_LABELS[bonus.bonus_type]}
                  {bonus.percentage !== undefined ? ` (+${bonus.percentage}%)` : ""}
                </p>
                <p className="font-medium text-emerald-600">+{formatINR(bonus.amount_paise)}</p>
              </div>
            ))
          )}
          <div className="flex items-center justify-between">
            <p className="text-slate-600">Task Bonuses Total</p>
            <p className="font-semibold text-emerald-600">
              +{formatINR(adjustment.task_bonuses_total_paise)}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-slate-600">Streak Bonus</p>
            <p className="font-semibold text-emerald-600">
              +{formatINR(adjustment.streak_bonus_paise)}
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-2 text-sm">
          <p className="font-medium text-slate-900">Penalties</p>
          {adjustment.penalties.length === 0 ? (
            <p className="text-slate-500">No penalties applied.</p>
          ) : (
            adjustment.penalties.map((penalty) => (
              <div
                key={`${penalty.penalty_type}-${penalty.label}`}
                className="flex items-center justify-between"
              >
                <p className="text-slate-600">
                  {penalty.label || PENALTY_TYPE_LABELS[penalty.penalty_type]}
                </p>
                <p className="font-medium text-red-600">-{formatINR(penalty.amount_paise)}</p>
              </div>
            ))
          )}
          <div className="flex items-center justify-between">
            <p className="text-slate-600">Penalty Total</p>
            <p className="font-semibold text-red-600">
              -{formatINR(adjustment.penalty_total_paise)}
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <p className="text-slate-600">Suggested Total</p>
            <p className="font-semibold text-slate-900">
              {formatINR(adjustment.suggested_total_paise)}
            </p>
          </div>
          {adjustment.admin_override_paise !== undefined && (
            <div className="flex items-center justify-between">
              <p className="text-slate-600">Admin Override</p>
              <p className="font-semibold text-orange-600">
                {formatINR(adjustment.admin_override_paise)}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between text-base">
            <p className="font-medium text-slate-900">Final Amount</p>
            <p className="font-bold text-slate-900">{formatINR(adjustment.final_amount_paise)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
