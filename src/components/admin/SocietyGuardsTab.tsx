"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { GUARD_TYPE, USER_STATUS } from "../../../lib/constants";
import { formatPhoneDisplay } from "../../../lib/validators";
import { GuardCreateDialog } from "./GuardCreateDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type SocietyGuardsTabProps = {
  societyId: Id<"societies">;
};

const GUARD_TYPE_LABELS: Record<string, string> = {
  [GUARD_TYPE.BUILDING_SPECIFIC]: "Building",
  [GUARD_TYPE.MAIN_GATE]: "Main Gate",
  [GUARD_TYPE.PARK]: "Park",
  [GUARD_TYPE.ROVING]: "Roving",
};

const GUARD_TYPE_BADGE_CLASS: Record<string, string> = {
  [GUARD_TYPE.BUILDING_SPECIFIC]: "border-blue-200 bg-blue-50 text-blue-700",
  [GUARD_TYPE.MAIN_GATE]: "border-violet-200 bg-violet-50 text-violet-700",
  [GUARD_TYPE.PARK]: "border-emerald-200 bg-emerald-50 text-emerald-700",
  [GUARD_TYPE.ROVING]: "border-orange-200 bg-orange-50 text-orange-700",
};

function statusBadgeClassName(status: string): string {
  if (status === USER_STATUS.ACTIVE) {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (status === USER_STATUS.BANNED) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

export function SocietyGuardsTab({ societyId }: SocietyGuardsTabProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const guards = useQuery(api.guards.list, { society_id: societyId });

  const isLoading = guards === undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {isLoading
            ? "Loading guards\u2026"
            : `${guards.length} guard${guards.length !== 1 ? "s" : ""} assigned`}
        </p>
        <Button
          type="button"
          className="h-9 bg-slate-900 text-white hover:bg-slate-800"
          onClick={() => setIsCreateOpen(true)}
        >
          <Plus className="size-4" />
          Add Guard
        </Button>
      </div>

      {isLoading ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-3 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Phone</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="py-2.5 pl-3 pr-0 text-right font-medium">Leads</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, index) => (
                <tr key={`guard-skeleton-${index}`} className="border-b border-slate-100">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-8 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-4 w-36" />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </td>
                  <td className="py-3 pl-3 pr-0 text-right">
                    <Skeleton className="ml-auto h-4 w-8" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : guards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <ShieldCheck className="mx-auto mb-3 size-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            No guards assigned to this society yet.
          </p>
          <p className="mt-1 text-sm text-slate-500">Add your first guard to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-3 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Phone</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="py-2.5 pl-3 pr-0 text-right font-medium">Leads</th>
              </tr>
            </thead>
            <tbody>
              {guards.map((guard) => (
                <tr key={guard.user_id} className="border-b border-slate-100 text-slate-800">
                  <td className="py-3 pr-3">
                    <Link
                      href={`/admin/guards/${guard.user_id}`}
                      className="flex items-center gap-3 transition-colors hover:text-slate-700"
                    >
                      <Avatar size="default">
                        <AvatarFallback className="bg-slate-100 text-xs font-medium text-slate-600">
                          {getInitials(guard.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-slate-900 hover:underline">
                        {guard.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-slate-600">
                    {guard.phone ? formatPhoneDisplay(guard.phone) : "\u2014"}
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      className={
                        GUARD_TYPE_BADGE_CLASS[guard.guard_type] ??
                        "border-slate-200 bg-slate-100 text-slate-600"
                      }
                    >
                      {GUARD_TYPE_LABELS[guard.guard_type] ?? guard.guard_type}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <Badge className={statusBadgeClassName(guard.status)}>{guard.status}</Badge>
                  </td>
                  <td className="py-3 pl-3 pr-0 text-right tabular-nums">
                    {guard.lead_count ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GuardCreateDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        defaultSocietyId={societyId}
      />
    </div>
  );
}
