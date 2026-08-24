"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { CheckCircle, FileText, HelpCircle, Loader2, MoreHorizontal, XCircle } from "lucide-react";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  CALL_OUTCOME,
  LEAD_STATUS,
  type LeadStatus,
  type QualityFlag,
} from "../../../../../../lib/constants";
import { formatRelativeTime } from "../../../../../../lib/dates";
import { SortableHeader, type SortState } from "@/components/admin/SortableHeader";
import { PriorityBadge } from "@/components/admin/PriorityBadge";
import { SLABadge } from "@/components/admin/SLABadge";
import { LeadStatusBadge } from "@/components/shared/lead-status-badge";
import { QualityFlagBadge } from "@/components/shared/quality-flag-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { LeadSearchBar } from "./lead-search-bar";

type LeadTableProps = {
  statusFilter: LeadStatus | undefined;
  societyFilter: Id<"societies"> | undefined;
  qualityFlagFilter: QualityFlag | undefined;
  searchText: string;
  searchQuery: string | undefined;
  onSearchTextChange: (value: string) => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  selectedLeadId: Id<"leads"> | null;
  onSelectLead: (id: Id<"leads">) => void;
  selectedIds: Set<Id<"leads">>;
  onSelectionChange: (nextSelection: Set<Id<"leads">>) => void;
  canVerifyLeads: boolean;
  canRejectLeads: boolean;
  canRequestInfoLeads: boolean;
  sortOrder: LeadSortOption;
  onVisibleLeadsChange?: (leads: LeadTableItem[]) => void;
};

export type LeadTableItem = {
  _id: Id<"leads">;
  _creationTime: number;
  sla_started_at_ms?: number;
  floor_number: string;
  flat_number: string;
  owner_name?: string;
  owner_phone: string;
  status: LeadStatus;
  quality_flags?: string[];
  guard_name?: string;
  building_name?: string;
  society_name?: string;
  priority_score: number;
  priority_tier: "HIGH" | "MEDIUM" | "LOW";
};

type LeadSortColumn = "submitted_at" | "status";
export type LeadSortOption =
  | "priority_desc"
  | "submitted_desc"
  | "submitted_asc"
  | "status_desc"
  | "status_asc";

function getSortOrderFromColumnSort(sortState: SortState): LeadSortOption | undefined {
  const column = sortState.column as LeadSortColumn | "";

  if (column === "submitted_at") {
    return sortState.direction === "asc" ? "submitted_asc" : "submitted_desc";
  }

  if (column === "status") {
    return sortState.direction === "asc" ? "status_asc" : "status_desc";
  }

  return undefined;
}

function maskPhone(phone: string): string {
  if (phone.length <= 5) return phone;
  return `${phone.slice(0, 5)}...`;
}

export function LeadTable({
  statusFilter,
  societyFilter,
  qualityFlagFilter,
  searchText,
  searchQuery,
  onSearchTextChange,
  searchInputRef,
  selectedLeadId,
  onSelectLead,
  selectedIds,
  onSelectionChange,
  canVerifyLeads,
  canRejectLeads,
  canRequestInfoLeads,
  sortOrder,
  onVisibleLeadsChange,
}: LeadTableProps) {
  const isSearching = (searchQuery?.length ?? 0) > 0;
  const createVerification = useMutation(api.verifications.create);
  const rejectLead = useMutation(api.leads.reject);
  const requestInfoLead = useMutation(api.leads.requestInfo);
  const [inlineLoading, setInlineLoading] = useState<{
    leadId: Id<"leads">;
    action: "verify" | "reject" | "requestInfo";
  } | null>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.leads.list,
    {
      status: statusFilter,
      society_id: societyFilter,
      quality_flag: qualityFlagFilter,
      search: isSearching ? searchQuery : undefined,
    },
    { initialNumItems: 20 },
  );

  const isLoading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore" && !isSearching;
  const isLoadingMore = status === "LoadingMore";
  const hasMoreAvailable = status === "CanLoadMore";
  const [currentSort, setCurrentSort] = useState<SortState>({
    column: "",
    direction: "asc",
  });

  useEffect(() => {
    setCurrentSort({ column: "", direction: "asc" });
  }, [sortOrder]);

  const sortedResults = useMemo(() => {
    const sorted = [...(results as LeadTableItem[])];
    const effectiveSortOrder = getSortOrderFromColumnSort(currentSort) ?? sortOrder;

    sorted.sort((a, b) => {
      switch (effectiveSortOrder) {
        case "priority_desc": {
          if (b.priority_score !== a.priority_score) {
            return b.priority_score - a.priority_score;
          }

          return a._creationTime - b._creationTime;
        }
        case "submitted_asc":
          return a._creationTime - b._creationTime;
        case "submitted_desc":
          return b._creationTime - a._creationTime;
        case "status_asc": {
          return a.status.localeCompare(b.status, undefined, { sensitivity: "base" });
        }
        case "status_desc": {
          return b.status.localeCompare(a.status, undefined, { sensitivity: "base" });
        }
      }
    });

    return sorted;
  }, [currentSort, results, sortOrder]);

  useEffect(() => {
    onVisibleLeadsChange?.(sortedResults);
  }, [onVisibleLeadsChange, sortedResults]);

  const handleSort = (column: string) => {
    setCurrentSort((previous) => {
      if (previous.column === column) {
        return {
          column,
          direction: previous.direction === "asc" ? "desc" : "asc",
        };
      }

      return { column, direction: "asc" };
    });
  };

  const visibleLeadIds = useMemo(() => sortedResults.map((lead) => lead._id), [sortedResults]);

  const selectedVisibleCount = useMemo(
    () => visibleLeadIds.filter((leadId) => selectedIds.has(leadId)).length,
    [selectedIds, visibleLeadIds],
  );

  const allVisibleSelected =
    visibleLeadIds.length > 0 && selectedVisibleCount === visibleLeadIds.length;
  const hasSomeVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const toggleLeadSelection = (leadId: Id<"leads">, checked: boolean) => {
    const nextSelection = new Set(selectedIds);

    if (checked) {
      nextSelection.add(leadId);
    } else {
      nextSelection.delete(leadId);
    }

    onSelectionChange(nextSelection);
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    const nextSelection = new Set(selectedIds);

    if (checked) {
      for (const leadId of visibleLeadIds) {
        nextSelection.add(leadId);
      }
    } else {
      for (const leadId of visibleLeadIds) {
        nextSelection.delete(leadId);
      }
    }

    onSelectionChange(nextSelection);
  };

  const handleVerifyLead = useCallback(
    async (leadId: Id<"leads">) => {
      setInlineLoading({ leadId, action: "verify" });
      try {
        await createVerification({
          lead_id: leadId,
          call_outcome: CALL_OUTCOME.VERIFIED,
          consent_contact_demorentals: true,
          consent_visit_coordination: false,
          notes: "Verified via inline action.",
        });
        toast.success("Lead verified");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to verify lead");
      } finally {
        setInlineLoading(null);
      }
    },
    [createVerification],
  );

  const handleRejectLead = useCallback(
    async (leadId: Id<"leads">) => {
      setInlineLoading({ leadId, action: "reject" });
      try {
        await rejectLead({
          lead_id: leadId,
          reason: "Rejected via inline action.",
        });
        toast.success("Lead rejected");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to reject lead");
      } finally {
        setInlineLoading(null);
      }
    },
    [rejectLead],
  );

  const handleRequestInfoLead = useCallback(
    async (leadId: Id<"leads">) => {
      setInlineLoading({ leadId, action: "requestInfo" });
      try {
        await requestInfoLead({
          lead_id: leadId,
          note: "Please share additional details to proceed with verification.",
        });
        toast.success("Info requested");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to request info");
      } finally {
        setInlineLoading(null);
      }
    },
    [requestInfoLead],
  );

  const copyLeadId = useCallback(async (leadId: Id<"leads">) => {
    try {
      await navigator.clipboard.writeText(leadId);
      toast.success("Lead ID copied");
    } catch {
      toast.error("Failed to copy Lead ID");
    }
  }, []);

  return (
    <div className="space-y-3">
      <LeadSearchBar value={searchText} onChange={onSearchTextChange} inputRef={searchInputRef} />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1420px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="w-10 py-2.5 pr-2 font-medium">
                    <Checkbox
                      checked={
                        allVisibleSelected ? true : hasSomeVisibleSelected ? "indeterminate" : false
                      }
                      onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                      aria-label="Select all leads on this page"
                      disabled={visibleLeadIds.length === 0}
                    />
                  </th>
                  <th className="w-12 py-2.5 pr-2 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Society</th>
                  <th className="px-3 py-2.5 font-medium">Building / Flat</th>
                  <th className="px-3 py-2.5 font-medium">Owner Name</th>
                  <th className="px-3 py-2.5 font-medium">Phone</th>
                  <th className="px-3 py-2.5 font-medium">Guard</th>
                  <SortableHeader
                    column="submitted_at"
                    label="Time"
                    currentSort={currentSort}
                    onSortAction={handleSort}
                    className="w-20"
                  />
                  <SortableHeader
                    column="status"
                    label="Status"
                    currentSort={currentSort}
                    onSortAction={handleSort}
                    className="w-32"
                  />
                  <th className="w-32 px-3 py-2.5 font-medium">Priority</th>
                  <th className="w-28 px-3 py-2.5 font-medium">SLA</th>
                  <th className="w-48 py-2.5 pl-3 pr-0 font-medium">Flags</th>
                  <th className="w-40 py-2.5 pl-2 pr-0 font-medium" />
                </tr>
              </thead>

              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, index) => (
                      <tr key={`lead-skeleton-${index}`} className="border-b border-slate-100">
                        <td className="py-3 pr-2">
                          <Skeleton className="size-4" />
                        </td>
                        <td className="py-3 pr-2">
                          <Skeleton className="h-4 w-6" />
                        </td>
                        <td className="px-3 py-3">
                          <Skeleton className="h-4 w-28" />
                        </td>
                        <td className="px-3 py-3">
                          <Skeleton className="h-4 w-36" />
                        </td>
                        <td className="px-3 py-3">
                          <Skeleton className="h-4 w-28" />
                        </td>
                        <td className="px-3 py-3">
                          <Skeleton className="h-4 w-20" />
                        </td>
                        <td className="px-3 py-3">
                          <Skeleton className="h-4 w-20" />
                        </td>
                        <td className="px-3 py-3">
                          <Skeleton className="h-4 w-10" />
                        </td>
                        <td className="px-3 py-3">
                          <Skeleton className="h-6 w-24 rounded-full" />
                        </td>
                        <td className="px-3 py-3">
                          <Skeleton className="h-6 w-20 rounded-full" />
                        </td>
                        <td className="px-3 py-3">
                          <Skeleton className="h-5 w-20" />
                        </td>
                        <td className="py-3 pl-3 pr-0">
                          <Skeleton className="h-4 w-4" />
                        </td>
                        <td className="py-3 pl-2 pr-0">
                          <Skeleton className="h-8 w-20" />
                        </td>
                      </tr>
                    ))
                  : sortedResults.map((lead, index) => {
                      const isSelected = selectedLeadId === lead._id;
                      const hasFlags = (lead.quality_flags?.length ?? 0) > 0;
                      const isChecked = selectedIds.has(lead._id);
                      const isTerminalLeadStatus =
                        lead.status === LEAD_STATUS.REJECTED ||
                        lead.status === LEAD_STATUS.DUPLICATE;
                      const canShowVerify =
                        canVerifyLeads &&
                        (lead.status === LEAD_STATUS.SUBMITTED ||
                          lead.status === LEAD_STATUS.NEED_INFO);
                      const canShowReject = canRejectLeads && !isTerminalLeadStatus;
                      const canShowRequestInfo =
                        canRequestInfoLeads && lead.status === LEAD_STATUS.SUBMITTED;
                      const isActionLoading = inlineLoading?.leadId === lead._id;

                      return (
                        <tr
                          key={lead._id}
                          onClick={() => onSelectLead(lead._id)}
                          className={cn(
                            "group cursor-pointer border-b border-slate-100 transition-colors",
                            isSelected ? "bg-slate-100" : "text-slate-800 hover:bg-slate-50",
                          )}
                        >
                          <td className="py-3 pr-2" onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) =>
                                toggleLeadSelection(lead._id, checked === true)
                              }
                              aria-label={`Select lead ${lead._id}`}
                            />
                          </td>
                          <td className="py-3 pr-2 text-slate-400">{index + 1}</td>
                          <td className="px-3 py-3 font-medium text-slate-700">
                            {lead.society_name ?? "—"}
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-slate-900">{lead.building_name ?? "—"}</span>
                            <span className="text-slate-400">
                              {" / Fl"}
                              {lead.floor_number}
                              {" / "}
                            </span>
                            <span className="font-medium text-slate-800">{lead.flat_number}</span>
                          </td>
                          <td className="px-3 py-3 text-slate-700">
                            {lead.owner_name ?? "Unknown"}
                          </td>
                          <td className="px-3 py-3">
                            <a
                              href={`tel:+91${lead.owner_phone}`}
                              className="text-slate-600 hover:text-slate-900 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {maskPhone(lead.owner_phone)}
                            </a>
                          </td>
                          <td className="px-3 py-3 text-slate-700">{lead.guard_name ?? "—"}</td>
                          <td className="px-3 py-3 text-slate-500">
                            {formatRelativeTime(lead._creationTime)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <LeadStatusBadge status={lead.status} />
                              {lead.status === LEAD_STATUS.VERIFIED && (
                                <CheckCircle className="size-3.5 text-green-600" />
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <PriorityBadge tier={lead.priority_tier} score={lead.priority_score} />
                          </td>
                          <td className="px-3 py-3">
                            <SLABadge
                              entity_type="lead"
                              sla_started_at_ms={lead.sla_started_at_ms ?? lead._creationTime}
                            />
                          </td>
                          <td className="py-3 pl-3 pr-0">
                            {hasFlags ? (
                              <QualityFlagBadge flags={lead.quality_flags ?? []} />
                            ) : (
                              <span className="text-slate-300">\u2014</span>
                            )}
                          </td>
                          <td
                            className="py-3 pl-2 pr-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <TooltipProvider delayDuration={500}>
                              <div className="flex items-center justify-end gap-0.5">
                                {canShowVerify ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void handleVerifyLead(lead._id);
                                        }}
                                        disabled={isActionLoading}
                                        aria-label="Verify"
                                      >
                                        {isActionLoading && inlineLoading?.action === "verify" ? (
                                          <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                          <CheckCircle className="size-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" sideOffset={6}>
                                      Verify
                                    </TooltipContent>
                                  </Tooltip>
                                ) : null}

                                {canShowReject ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void handleRejectLead(lead._id);
                                        }}
                                        disabled={isActionLoading}
                                        aria-label="Reject"
                                      >
                                        {isActionLoading && inlineLoading?.action === "reject" ? (
                                          <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                          <XCircle className="size-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" sideOffset={6}>
                                      Reject
                                    </TooltipContent>
                                  </Tooltip>
                                ) : null}

                                {canShowRequestInfo ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void handleRequestInfoLead(lead._id);
                                        }}
                                        disabled={isActionLoading}
                                        aria-label="Need Info"
                                      >
                                        {isActionLoading &&
                                        inlineLoading?.action === "requestInfo" ? (
                                          <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                          <HelpCircle className="size-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" sideOffset={6}>
                                      Need Info
                                    </TooltipContent>
                                  </Tooltip>
                                ) : null}

                                <DropdownMenu>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={(event) => event.stopPropagation()}
                                          aria-label="More actions"
                                        >
                                          <MoreHorizontal className="size-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" sideOffset={6}>
                                      More
                                    </TooltipContent>
                                  </Tooltip>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onSelectLead(lead._id);
                                      }}
                                    >
                                      View Detail
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void copyLeadId(lead._id);
                                      }}
                                    >
                                      Copy Lead ID
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TooltipProvider>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {!isLoading && results.length === 0 && (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-3 size-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">
                {statusFilter
                  ? `No ${statusFilter.toLowerCase().replace(/_/g, " ")} leads`
                  : "No leads found"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {isSearching
                  ? "Try a different search term."
                  : "Leads will appear here as guards submit them."}
              </p>
            </div>
          )}

          {!isLoading && (
            <p className="pt-4 text-sm text-muted-foreground">
              Showing {results.length} results{hasMoreAvailable ? " (more available)" : ""}
            </p>
          )}

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
    </div>
  );
}
