"use client";

import Link from "next/link";
import { formatDate, formatRelativeTime } from "../../../../lib/dates";
import {
  RM_ASSIGNMENT_STATUS_COLORS,
  RM_ASSIGNMENT_STATUS_LABELS,
  RM_CHECK_IN_METHOD_LABELS,
  RM_CHECK_IN_OUTCOME_COLORS,
  RM_CHECK_IN_OUTCOME_LABELS,
  RM_CHECK_IN_TYPE_LABELS,
  type RmAssignmentStatus,
  type RmCheckInMethod,
  type RmCheckInOutcome,
  type RmCheckInType,
} from "../../../../lib/constants";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Phone, UserRound } from "lucide-react";

type RmAssignment = {
  status: RmAssignmentStatus;
  rm_name: string | null;
  rm_phone: string | null;
  last_check_in_at?: number;
  next_check_in_due?: number;
};

type RmCheckIn = {
  _id: string;
  created_at: number;
  check_in_type: RmCheckInType;
  method: RmCheckInMethod;
  outcome: RmCheckInOutcome;
  summary: string;
};

type OwnerRmContactCardProps = {
  assignment: RmAssignment | null;
  checkIns: RmCheckIn[];
};

function getInitials(name: string | null): string {
  if (!name) {
    return "RM";
  }

  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return "RM";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function normalizePhone(phone: string | null): string {
  if (!phone) {
    return "";
  }

  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

function formatPhoneDisplay(phone: string | null): string {
  const normalized = normalizePhone(phone);
  if (normalized.length === 12 && normalized.startsWith("91")) {
    const local = normalized.slice(2);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }

  return phone ?? "Phone unavailable";
}

export function OwnerRmContactCard({ assignment, checkIns }: OwnerRmContactCardProps) {
  if (!assignment) {
    return (
      <Card className="border-indigo-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <UserRound className="size-4 text-indigo-600" />
            Relationship Manager
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            No RM assigned yet. Our support team can help while assignment is in progress.
          </p>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Platform contact: support@guards.local
          </div>
          <Button asChild className="w-full bg-indigo-600 text-white hover:bg-indigo-700">
            <Link href="/owner/service-requests">Request RM</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const rmPhone = normalizePhone(assignment.rm_phone);
  const hasPhone = rmPhone.length > 0;

  return (
    <Card className="border-indigo-200 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-slate-900">Relationship Manager</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <Avatar className="size-10 border border-indigo-200">
            <AvatarFallback className="bg-indigo-100 text-indigo-700">
              {getInitials(assignment.rm_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {assignment.rm_name ?? "Relationship Manager"}
            </p>
            <Badge
              className={`mt-1 text-[10px] font-semibold uppercase tracking-wide ${RM_ASSIGNMENT_STATUS_COLORS[assignment.status]}`}
            >
              {RM_ASSIGNMENT_STATUS_LABELS[assignment.status] ?? assignment.status}
            </Badge>
            {assignment.last_check_in_at ? (
              <p className="mt-1 text-xs text-slate-600">
                Last check-in {formatRelativeTime(assignment.last_check_in_at)}
              </p>
            ) : null}
            {assignment.next_check_in_due ? (
              <p className="text-xs text-slate-500">
                Next due {formatDate(assignment.next_check_in_due)}
              </p>
            ) : null}
          </div>
        </div>

        <p className="text-xs font-medium text-slate-700">
          {formatPhoneDisplay(assignment.rm_phone)}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button
            asChild
            size="sm"
            className="bg-indigo-600 text-white hover:bg-indigo-700"
            disabled={!hasPhone}
          >
            <a href={hasPhone ? `tel:+${rmPhone}` : undefined}>
              <Phone className="mr-1.5 size-3.5" />
              Call
            </a>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            disabled={!hasPhone}
          >
            <a
              href={hasPhone ? `https://wa.me/${rmPhone}` : undefined}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="mr-1.5 size-3.5" />
              WhatsApp
            </a>
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Check-in History
          </p>
          {checkIns.length === 0 ? (
            <p className="text-xs text-slate-500">No RM check-ins yet.</p>
          ) : (
            <div className="space-y-2">
              {checkIns.map((checkIn) => (
                <div
                  key={checkIn._id}
                  className="rounded-md border border-slate-200 bg-slate-50 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-700">
                      {formatDate(checkIn.created_at)}
                    </p>
                    <Badge
                      className={`text-[10px] font-semibold ${RM_CHECK_IN_OUTCOME_COLORS[checkIn.outcome]}`}
                    >
                      {RM_CHECK_IN_OUTCOME_LABELS[checkIn.outcome] ?? checkIn.outcome}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {(RM_CHECK_IN_TYPE_LABELS[checkIn.check_in_type] ?? checkIn.check_in_type) +
                      " via " +
                      (RM_CHECK_IN_METHOD_LABELS[checkIn.method] ?? checkIn.method)}
                  </p>
                  <p className="mt-1 text-xs text-slate-800">{checkIn.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
