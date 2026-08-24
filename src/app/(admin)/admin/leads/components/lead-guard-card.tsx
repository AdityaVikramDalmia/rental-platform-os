"use client";

import Link from "next/link";
import { ShieldCheck, Phone } from "lucide-react";
import { GUARD_TYPE, type GuardType } from "../../../../../../lib/constants";
import { formatPhoneDisplay } from "../../../../../../lib/validators";

const GUARD_TYPE_LABELS: Record<string, string> = {
  [GUARD_TYPE.BUILDING_SPECIFIC]: "Building",
  [GUARD_TYPE.MAIN_GATE]: "Main Gate",
  [GUARD_TYPE.PARK]: "Park",
  [GUARD_TYPE.ROVING]: "Roving",
};

type LeadGuardCardProps = {
  guard: {
    user_id: string;
    name: string;
    email?: string;
    phone?: string;
    guard_type?: string;
    society_id?: string;
  };
  societyName?: string;
};

export function LeadGuardCard({ guard, societyName }: LeadGuardCardProps) {
  const guardTypeLabel = guard.guard_type
    ? (GUARD_TYPE_LABELS[guard.guard_type] ?? guard.guard_type)
    : "—";

  const guardPhone = guard.phone ?? guard.email?.replace("@guards.local", "") ?? "";

  return (
    <Link
      href={`/admin/guards/${guard.user_id}`}
      className="block rounded-lg border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-slate-300 hover:bg-slate-100"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-200">
          <ShieldCheck className="size-4 text-slate-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{guard.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3" />
              {formatPhoneDisplay(guardPhone)}
            </span>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
              {guardTypeLabel}
            </span>
          </div>
          {societyName && <p className="mt-0.5 text-xs text-slate-400">{societyName}</p>}
        </div>
      </div>
    </Link>
  );
}
