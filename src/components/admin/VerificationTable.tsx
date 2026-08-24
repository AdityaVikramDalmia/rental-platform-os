"use client";

import { usePaginatedQuery } from "convex/react";
import { AlertTriangle, CheckCheck, Eye, EyeOff, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LEAD_STATUS, QUALITY_FLAGS, type LeadStatus } from "../../../lib/constants";
import { formatPhoneDisplay } from "../../../lib/validators";
import { SLABadge } from "@/components/admin/SLABadge";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const DAY_MS = 24 * 60 * 60 * 1000;

export type VerificationLead = {
  _id: Id<"leads">;
  _creationTime: number;
  sla_started_at_ms?: number;
  society_name?: string;
  building_name?: string;
  floor_number: string;
  flat_number: string;
  owner_name?: string;
  owner_phone: string;
  guard_name?: string;
  quality_flags?: string[];
  status: LeadStatus;
  prospective_bounty?: number;
};

type VerificationTableProps = {
  statusFilter: LeadStatus | undefined;
  action: (lead: VerificationLead) => void;
  selectedIds: Set<Id<"leads">>;
  selectionAction: (nextSelection: Set<Id<"leads">>) => void;
};

function getDaysWaitingColorClass(daysWaiting: number): string {
  if (daysWaiting < 1) {
    return "text-emerald-600";
  }

  if (daysWaiting <= 3) {
    return "text-amber-600";
  }

  return "text-red-600";
}

function maskPhoneNumber(phone: string): string {
  if (phone.length <= 5) {
    return phone;
  }

  return `${phone.slice(0, 5)}XXXXX`;
}

function hasDuplicateFlag(lead: VerificationLead): boolean {
  const flags = lead.quality_flags ?? [];
  return (
    lead.status === LEAD_STATUS.POTENTIAL_DUPLICATE ||
    flags.includes(QUALITY_FLAGS.DUPLICATE_FLAT_MATCH) ||
    flags.includes(QUALITY_FLAGS.DUPLICATE_PHONE_MATCH)
  );
}

export function VerificationTable({
  statusFilter,
  action,
  selectedIds,
  selectionAction,
}: VerificationTableProps) {
  const [revealedPhones, setRevealedPhones] = useState<Set<Id<"leads">>>(new Set());
  const [nowMs] = useState(() => Date.now());

  const { results, status, loadMore } = usePaginatedQuery(
    api.leads.list,
    {
      status: statusFilter,
    },
    { initialNumItems: 20 },
  );

  const sortedLeads = useMemo(() => {
    const leads = results as VerificationLead[];
    return [...leads].sort((a, b) => a._creationTime - b._creationTime);
  }, [results]);

  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  const selectableLeadIds = useMemo(
    () =>
      sortedLeads.filter((lead) => lead.status === LEAD_STATUS.SUBMITTED).map((lead) => lead._id),
    [sortedLeads],
  );

  const selectedVisibleCount = useMemo(
    () => selectableLeadIds.filter((leadId) => selectedIds.has(leadId)).length,
    [selectableLeadIds, selectedIds],
  );

  const allVisibleSelected =
    selectableLeadIds.length > 0 && selectedVisibleCount === selectableLeadIds.length;
  const hasSomeVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const togglePhoneReveal = (leadId: Id<"leads">) => {
    setRevealedPhones((previous) => {
      const next = new Set(previous);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  };

  const toggleLeadSelection = (leadId: Id<"leads">, checked: boolean) => {
    const nextSelection = new Set(selectedIds);
    if (checked) {
      nextSelection.add(leadId);
    } else {
      nextSelection.delete(leadId);
    }
    selectionAction(nextSelection);
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    const nextSelection = new Set(selectedIds);

    if (checked) {
      for (const leadId of selectableLeadIds) {
        nextSelection.add(leadId);
      }
    } else {
      for (const leadId of selectableLeadIds) {
        nextSelection.delete(leadId);
      }
    }

    selectionAction(nextSelection);
  };

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="w-10 px-3 py-2.5 font-medium">
                  <Checkbox
                    checked={
                      allVisibleSelected ? true : hasSomeVisibleSelected ? "indeterminate" : false
                    }
                    onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                    aria-label="Select all leads on this page"
                    disabled={selectableLeadIds.length === 0}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">Society</th>
                <th className="px-3 py-2.5 font-medium">Building / Floor / Flat</th>
                <th className="px-3 py-2.5 font-medium">Owner Name</th>
                <th className="px-3 py-2.5 font-medium">Phone</th>
                <th className="px-3 py-2.5 font-medium">Guard</th>
                <th className="px-3 py-2.5 font-medium">Days Waiting</th>
                <th className="px-3 py-2.5 font-medium">SLA</th>
                <th className="px-3 py-2.5 font-medium">Quality Flags</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr
                      key={`verification-skeleton-${index}`}
                      className="border-b border-slate-100"
                    >
                      <td className="px-3 py-3">
                        <Skeleton className="size-4" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-28" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-44" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-4 w-16" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-5 w-20" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </td>
                      <td className="px-3 py-3">
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Skeleton className="ml-auto h-8 w-20" />
                      </td>
                    </tr>
                  ))
                : sortedLeads.map((lead) => {
                    const daysWaiting = Math.floor((nowMs - lead._creationTime) / DAY_MS);
                    const isPhoneRevealed = revealedPhones.has(lead._id);
                    const duplicateFlag = hasDuplicateFlag(lead);
                    const highRejectionFlag = (lead.quality_flags ?? []).includes(
                      QUALITY_FLAGS.GUARD_HIGH_REJECTION,
                    );
                    const highValueFlag = (lead.prospective_bounty ?? 0) > 0;
                    const canVerifyLead = lead.status === LEAD_STATUS.SUBMITTED;
                    const isSelected = selectedIds.has(lead._id);

                    return (
                      <tr key={lead._id} className="border-b border-slate-100 text-slate-800">
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              toggleLeadSelection(lead._id, checked === true)
                            }
                            disabled={!canVerifyLead}
                            aria-label={`Select lead ${lead._id}`}
                          />
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-700">
                          {lead.society_name ?? "-"}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          <span className="text-slate-900">{lead.building_name ?? "-"}</span>
                          <span className="text-slate-400"> / Floor {lead.floor_number} / </span>
                          <span className="font-medium text-slate-800">{lead.flat_number}</span>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{lead.owner_name ?? "Unknown"}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <a
                              href={`tel:+91${lead.owner_phone}`}
                              className="font-medium text-slate-700 hover:text-slate-900 hover:underline"
                            >
                              {isPhoneRevealed
                                ? formatPhoneDisplay(lead.owner_phone)
                                : maskPhoneNumber(lead.owner_phone)}
                            </a>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => togglePhoneReveal(lead._id)}
                              aria-label={
                                isPhoneRevealed ? "Hide phone number" : "Show phone number"
                              }
                            >
                              {isPhoneRevealed ? (
                                <EyeOff className="size-3.5" />
                              ) : (
                                <Eye className="size-3.5" />
                              )}
                            </Button>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{lead.guard_name ?? "-"}</td>
                        <td className="px-3 py-3">
                          <div
                            className={`inline-flex items-center gap-1 font-semibold ${getDaysWaitingColorClass(daysWaiting)}`}
                          >
                            {daysWaiting > 3 ? <AlertTriangle className="size-3.5" /> : null}
                            {daysWaiting}d
                            {highValueFlag ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="border-amber-300 bg-amber-100 text-amber-900">
                                      ₹
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" sideOffset={6}>
                                    High-value lead - bounty set
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <SLABadge
                            entity_type="lead"
                            sla_started_at_ms={lead.sla_started_at_ms ?? lead._creationTime}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {duplicateFlag ? (
                              <Badge className="border-orange-200 bg-orange-100 text-orange-800">
                                Dup?
                              </Badge>
                            ) : null}
                            {highRejectionFlag ? (
                              <Badge className="border-red-200 bg-red-100 text-red-700">⚠</Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <LeadStatusBadge status={lead.status} />
                            {lead.status === LEAD_STATUS.POTENTIAL_DUPLICATE ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="border-orange-200 bg-orange-100 text-orange-800">
                                      Dup?
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" sideOffset={6}>
                                    Must clear duplicate flag before verifying - two-step flow
                                    required.
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => action(lead)}
                            disabled={!canVerifyLead}
                            className="bg-slate-900 text-white hover:bg-slate-800"
                          >
                            Verify
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!isLoading && sortedLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <CheckCheck className="size-10 text-emerald-500" />
            <p className="text-sm font-medium text-slate-700">No leads awaiting verification.</p>
          </div>
        ) : null}

        {(canLoadMore || isLoadingMore) && (
          <div className="flex justify-center pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => loadMore(20)}
              disabled={isLoadingMore}
              className="border-slate-300 text-slate-700"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
