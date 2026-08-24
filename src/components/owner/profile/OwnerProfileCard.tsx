"use client";

import { Building2, Mail, Phone, UserRound } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  OWNER_LIFECYCLE_LABELS,
  OWNER_LIFECYCLE_STAGE_COLORS,
  type OwnerLifecycleStage,
} from "../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type OwnerProfileData = {
  _id: Id<"owners">;
  name?: string;
  email?: string;
  phone: string;
  lifecycle_stage: OwnerLifecycleStage;
};

type OwnerProfileCardProps = {
  owner: OwnerProfileData;
};

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }

  return phone;
}

export function OwnerProfileCard({ owner }: OwnerProfileCardProps) {
  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-slate-900">
          <UserRound className="size-4 text-indigo-600" />
          Owner Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-lg font-semibold text-slate-900">{owner.name?.trim() || "Owner"}</p>
          <Badge
            className={`mt-1 text-[10px] font-semibold uppercase tracking-wide ${OWNER_LIFECYCLE_STAGE_COLORS[owner.lifecycle_stage]}`}
          >
            {OWNER_LIFECYCLE_LABELS[owner.lifecycle_stage] ?? owner.lifecycle_stage}
          </Badge>
        </div>

        <div className="space-y-1 text-sm text-slate-700">
          <p className="flex items-center gap-2">
            <Phone className="size-3.5 text-indigo-600" />
            {formatPhoneDisplay(owner.phone)}
          </p>
          <p className="flex items-center gap-2">
            <Mail className="size-3.5 text-indigo-600" />
            {owner.email ?? "Email not set"}
          </p>
          <p className="flex items-center gap-2">
            <Building2 className="size-3.5 text-indigo-600" />
            Owner ID: {String(owner._id).slice(-8)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
