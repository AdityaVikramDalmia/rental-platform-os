import { FRESHNESS_STATE_COLORS } from "../../../../../lib/constants";
import { formatRelativeTime } from "../../../../../lib/dates";
import { TrustBadgeChip } from "@/components/shared/trust-badge-chip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TrustStripProps = {
  trust:
    | {
        badges: Array<{
          type: string;
          earned: boolean;
          timestamp?: number;
          count?: number;
        }>;
        freshness_score: number;
        freshness_state: "FRESH" | "AGING" | "STALE";
        last_activity_at?: number;
        last_computed_at: number;
        evidence?: {
          photo_count?: number;
          visit_count?: number;
          has_closure?: boolean;
        };
      }
    | null
    | undefined;
};

export function TrustStrip({ trust }: TrustStripProps) {
  if (!trust) {
    return (
      <Card className="border-slate-200 bg-slate-50/60">
        <CardContent className="p-4">
          <p className="text-sm text-slate-600">
            Trust signals are being computed for this listing.
          </p>
        </CardContent>
      </Card>
    );
  }

  const freshnessClassName = FRESHNESS_STATE_COLORS[trust.freshness_state];
  const freshnessAccentClass = freshnessClassName.includes("emerald")
    ? "border-emerald-100 bg-emerald-50/40"
    : freshnessClassName.includes("amber")
      ? "border-amber-100 bg-amber-50/40"
      : "border-red-100 bg-red-50/40";
  const photoCount = trust.evidence?.photo_count ?? 0;
  const visitCount = trust.evidence?.visit_count ?? 0;
  const hasClosure = trust.evidence?.has_closure === true;
  const earnedBadges = trust.badges.filter((badge) => badge.earned);

  return (
    <Card className={cn("border", freshnessAccentClass)}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Trust &amp; Verification</h2>
          <div className="flex items-center gap-2">
            <Badge className={freshnessClassName}>{trust.freshness_state}</Badge>
            <span className="text-xs font-medium text-slate-600">
              Freshness Score: {trust.freshness_score}
            </span>
          </div>
        </div>

        {earnedBadges.length > 0 ? (
          <TrustBadgeChip badges={trust.badges} maxBadges={6} />
        ) : (
          <p className="text-xs text-slate-500">No trust badges earned yet.</p>
        )}

        <p className="text-xs text-slate-600">
          {trust.last_activity_at
            ? `Last activity ${formatRelativeTime(trust.last_activity_at)}`
            : "Last activity not available yet"}
        </p>

        <p className="text-xs text-slate-600">
          Evidence: {photoCount} photos, {visitCount} completed visits, closure history{" "}
          {hasClosure ? "available" : "not yet available"}.
        </p>
      </CardContent>
    </Card>
  );
}
