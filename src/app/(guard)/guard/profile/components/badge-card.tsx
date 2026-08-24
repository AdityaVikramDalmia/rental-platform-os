"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../../../../convex/_generated/api";

type MyBadge = FunctionReturnType<typeof api.incentives.getMyCards>[number];

export function BadgeCard({ badge }: { badge: MyBadge }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="shrink-0 text-3xl leading-none" aria-hidden>
          {badge.tier_icon}
        </span>

        <div className="min-w-0 space-y-1.5">
          <p className="text-base font-semibold text-slate-900">{badge.card_type_display}</p>
          <p className="text-base text-slate-600">{badge.metric_description}</p>
          {badge.metadata?.reason ? (
            <p className="text-base text-slate-500">{badge.metadata.reason}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
