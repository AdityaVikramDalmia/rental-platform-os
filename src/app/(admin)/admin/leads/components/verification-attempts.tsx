"use client";

import { CheckCircle, PhoneOff, ShieldX, XCircle } from "lucide-react";
import { CALL_OUTCOME } from "../../../../../../lib/constants";
import { formatDateTime } from "../../../../../../lib/dates";

const OUTCOME_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> =
  {
    [CALL_OUTCOME.VERIFIED]: {
      label: "Verified",
      icon: <CheckCircle className="size-3.5" />,
      className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
    [CALL_OUTCOME.UNREACHABLE]: {
      label: "Unreachable",
      icon: <PhoneOff className="size-3.5" />,
      className: "bg-amber-100 text-amber-800 border-amber-200",
    },
    [CALL_OUTCOME.DECLINED]: {
      label: "Declined",
      icon: <XCircle className="size-3.5" />,
      className: "bg-red-100 text-red-800 border-red-200",
    },
    [CALL_OUTCOME.FALSE]: {
      label: "False Info",
      icon: <ShieldX className="size-3.5" />,
      className: "bg-red-100 text-red-800 border-red-200",
    },
  };

type VerificationAttempt = {
  _id: string;
  call_outcome: string;
  consent_contact_demorentals: boolean;
  consent_visit_coordination?: boolean;
  verified_at: number;
  notes?: string;
  admin_name?: string;
  called_by_admin_id: string;
};

type VerificationAttemptsProps = {
  attempts: VerificationAttempt[];
};

export function VerificationAttempts({ attempts }: VerificationAttemptsProps) {
  if (attempts.length === 0) {
    return <p className="text-sm italic text-slate-400">No verification attempts yet</p>;
  }

  return (
    <div className="space-y-2">
      {attempts.map((attempt) => {
        const config = OUTCOME_CONFIG[attempt.call_outcome] ?? {
          label: attempt.call_outcome,
          icon: null,
          className: "bg-slate-100 text-slate-700 border-slate-200",
        };

        return (
          <div
            key={attempt._id}
            className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.className}`}
              >
                {config.icon}
                {config.label}
              </span>
              <span className="text-xs text-slate-400">{formatDateTime(attempt.verified_at)}</span>
            </div>

            <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500">
              <span>by {attempt.admin_name ?? "Unknown"}</span>
              {attempt.call_outcome === CALL_OUTCOME.VERIFIED && (
                <span className="flex items-center gap-1">
                  {attempt.consent_contact_demorentals ? (
                    <CheckCircle className="size-3 text-emerald-600" />
                  ) : (
                    <XCircle className="size-3 text-slate-400" />
                  )}
                  Contact
                  {attempt.consent_visit_coordination && (
                    <>
                      <span className="text-slate-300">/</span>
                      <CheckCircle className="size-3 text-emerald-600" />
                      Visit
                    </>
                  )}
                </span>
              )}
            </div>

            {attempt.notes && (
              <p className="mt-1.5 text-slate-600 leading-snug">
                {attempt.notes.length > 120 ? `${attempt.notes.slice(0, 120)}...` : attempt.notes}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
