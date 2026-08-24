"use client";

import { useMutation, useQuery } from "convex/react";
import { Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  CALL_OUTCOME,
  LEAD_STATUS,
  PERMISSIONS,
  QUALITY_FLAGS,
  type LeadStatus,
  type QualityFlag,
} from "../../../../../lib/constants";
import { isValidConvexId } from "../../../../../lib/validators";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { KEYBOARD_SHORTCUTS } from "@/lib/keyboard-shortcuts";
import { BulkActionBar, type BulkAction } from "@/components/admin/BulkActionBar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type CsvColumn, exportToCsv } from "@/lib/export-csv";
import { LeadStatusTabs } from "./components/lead-status-tabs";
import { LeadTable, type LeadSortOption, type LeadTableItem } from "./components/lead-table";
import { LeadDetailPanel } from "./components/lead-detail-panel";

const VALID_STATUSES = new Set<string>(Object.values(LEAD_STATUS));

const QUALITY_FLAG_FILTER_OPTIONS = [
  { label: "All Flags", value: "ALL" },
  { label: "Guard High Rejection", value: QUALITY_FLAGS.GUARD_HIGH_REJECTION },
] as const;

const LEAD_SORT_OPTIONS: Array<{ label: string; value: LeadSortOption }> = [
  { label: "Sort by Priority", value: "priority_desc" },
  { label: "Newest First", value: "submitted_desc" },
  { label: "Oldest First", value: "submitted_asc" },
  { label: "Status (A-Z)", value: "status_asc" },
  { label: "Status (Z-A)", value: "status_desc" },
];

type QualityFlagFilter = (typeof QUALITY_FLAG_FILTER_OPTIONS)[number]["value"];

type LeadShortcutAction = "verify" | "reject" | null;

function parseStatusParam(param: string | null): LeadStatus | "ALL" {
  if (param && VALID_STATUSES.has(param)) {
    return param as LeadStatus;
  }
  return "ALL";
}

export default function LeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );

  const permissionSet = useMemo(() => {
    const permissions = new Set<string>();
    if (!roleAssignments) return permissions;
    for (const assignment of roleAssignments) {
      for (const permission of assignment.role.permissions) {
        permissions.add(permission);
      }
    }
    return permissions;
  }, [roleAssignments]);

  const hasLeadsView = permissionSet.has(PERMISSIONS.LEADS_VIEW);
  const hasSocietiesView = permissionSet.has(PERMISSIONS.SOCIETIES_VIEW);
  const activeTab = parseStatusParam(searchParams.get("status"));
  const [selectedLeadId, setSelectedLeadId] = useState<Id<"leads"> | null>(null);
  const leadIdParam = searchParams.get("id");
  const selectedLeadFromQuery =
    leadIdParam && isValidConvexId(leadIdParam) ? (leadIdParam as Id<"leads">) : null;
  const [societyFilter, setSocietyFilter] = useState("ALL");
  const [qualityFlagFilter, setQualityFlagFilter] = useState<QualityFlagFilter>("ALL");
  const [sortOrder, setSortOrder] = useState<LeadSortOption>("priority_desc");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState<string | undefined>(undefined);
  const [shortcutAction, setShortcutAction] = useState<LeadShortcutAction>(null);
  const [visibleLeads, setVisibleLeads] = useState<LeadTableItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"leads">>>(new Set());
  const [bulkLoadingAction, setBulkLoadingAction] = useState<
    "verify" | "reject" | "requestInfo" | null
  >(null);
  const [isBulkRejectDialogOpen, setIsBulkRejectDialogOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectedSociety = societyFilter === "ALL" ? undefined : (societyFilter as Id<"societies">);
  const selectedQualityFlag =
    qualityFlagFilter === "ALL" ? undefined : (qualityFlagFilter as QualityFlag);
  const canVerifyLeads = permissionSet.has(PERMISSIONS.LEADS_VERIFY);
  const canRejectLeads = permissionSet.has(PERMISSIONS.LEADS_REJECT);
  const canRequestInfoLeads = permissionSet.has(PERMISSIONS.LEADS_REQUEST_INFO);
  const createVerification = useMutation(api.verifications.create);
  const rejectLead = useMutation(api.leads.reject);
  const requestInfoLead = useMutation(api.leads.requestInfo);
  const selectedCount = selectedIds.size;
  const isBulkLoading = bulkLoadingAction !== null;

  const clearBulkSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const leadsShortcuts = useMemo(
    () =>
      KEYBOARD_SHORTCUTS.filter((shortcut) =>
        ["action.approve", "action.reject", "global.search"].includes(shortcut.id),
      ),
    [],
  );

  const leadsShortcutHandlers = useMemo<Record<string, () => void>>(
    () => ({
      "action.approve": () => {
        if (selectedLeadId && canVerifyLeads) {
          setShortcutAction("verify");
        }
      },
      "action.reject": () => {
        if (selectedLeadId && canRejectLeads) {
          setShortcutAction("reject");
        }
      },
      "global.search": () => {
        searchInputRef.current?.focus();
      },
    }),
    [canRejectLeads, canVerifyLeads, selectedLeadId],
  );

  useKeyboardShortcuts(leadsShortcuts, leadsShortcutHandlers);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalizedSearch = searchText.trim();
      setDebouncedSearch(normalizedSearch.length > 0 ? normalizedSearch : undefined);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    setSelectedLeadId(selectedLeadFromQuery);
  }, [selectedLeadFromQuery]);

  useEffect(() => {
    clearBulkSelection();
  }, [activeTab, selectedSociety, selectedQualityFlag, debouncedSearch, clearBulkSelection]);

  const societies = useQuery(api.societies.list, hasSocietiesView ? {} : "skip");
  const societyOptions = (societies ?? []) as Array<{
    _id: Id<"societies">;
    name: string;
    city: string;
  }>;

  const statusCounts = useQuery(
    api.leads.getStatusCounts,
    hasLeadsView
      ? {
          society_id: selectedSociety,
          quality_flag: selectedQualityFlag,
          search: debouncedSearch,
        }
      : "skip",
  );

  const handleTabChange = useCallback(
    (tab: LeadStatus | "ALL") => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "ALL") {
        params.delete("status");
      } else {
        params.set("status", tab);
      }
      params.delete("id");
      router.replace(`/admin/leads?${params.toString()}`, { scroll: false });
      setSelectedLeadId(null);
      setShortcutAction(null);
      clearBulkSelection();
    },
    [clearBulkSelection, router, searchParams],
  );

  const handleSelectLead = useCallback(
    (leadId: Id<"leads"> | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (leadId) {
        params.set("id", leadId);
      } else {
        params.delete("id");
      }

      const query = params.toString();
      router.replace(query ? `/admin/leads?${query}` : "/admin/leads", { scroll: false });
      setSelectedLeadId(leadId);
      setShortcutAction(null);
    },
    [router, searchParams],
  );

  const runBulkVerify = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }

    setBulkLoadingAction("verify");
    try {
      await Promise.all(
        ids.map((leadId) =>
          createVerification({
            lead_id: leadId,
            call_outcome: CALL_OUTCOME.VERIFIED,
            consent_contact_demorentals: true,
            consent_visit_coordination: false,
            notes: "Verified via bulk action.",
          }),
        ),
      );

      toast.success(`${ids.length} leads verified`);
      clearBulkSelection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to verify selected leads");
    } finally {
      setBulkLoadingAction(null);
    }
  }, [clearBulkSelection, createVerification, selectedIds]);

  const runBulkRequestInfo = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }

    setBulkLoadingAction("requestInfo");
    try {
      await Promise.all(
        ids.map((leadId) =>
          requestInfoLead({
            lead_id: leadId,
            note: "Please share additional details to proceed with verification.",
          }),
        ),
      );

      toast.success(`${ids.length} leads moved to Need Info`);
      clearBulkSelection();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to request info for selected leads",
      );
    } finally {
      setBulkLoadingAction(null);
    }
  }, [clearBulkSelection, requestInfoLead, selectedIds]);

  const runBulkReject = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }

    setBulkLoadingAction("reject");
    try {
      await Promise.all(
        ids.map((leadId) =>
          rejectLead({
            lead_id: leadId,
            reason: "Rejected via bulk action.",
          }),
        ),
      );

      toast.success(`${ids.length} leads rejected`);
      clearBulkSelection();
      setIsBulkRejectDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject selected leads");
    } finally {
      setBulkLoadingAction(null);
    }
  }, [clearBulkSelection, rejectLead, selectedIds]);

  const bulkActions = useMemo<BulkAction[]>(() => {
    const actions: BulkAction[] = [];

    const canShowVerify =
      canVerifyLeads && (activeTab === "ALL" || activeTab === LEAD_STATUS.SUBMITTED);
    const canShowReject =
      canRejectLeads && activeTab !== LEAD_STATUS.REJECTED && activeTab !== LEAD_STATUS.DUPLICATE;
    const canShowRequestInfo =
      canRequestInfoLeads && (activeTab === "ALL" || activeTab === LEAD_STATUS.SUBMITTED);

    if (canShowVerify) {
      actions.push({
        label: "Verify Selected",
        icon:
          bulkLoadingAction === "verify" ? <Loader2 className="size-4 animate-spin" /> : undefined,
        onClick: () => {
          void runBulkVerify();
        },
        disabled: isBulkLoading,
      });
    }

    if (canShowReject) {
      actions.push({
        label: "Reject Selected",
        variant: "destructive",
        icon:
          bulkLoadingAction === "reject" ? <Loader2 className="size-4 animate-spin" /> : undefined,
        onClick: () => setIsBulkRejectDialogOpen(true),
        disabled: isBulkLoading,
      });
    }

    if (canShowRequestInfo) {
      actions.push({
        label: "Request Info",
        variant: "outline",
        icon:
          bulkLoadingAction === "requestInfo" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : undefined,
        onClick: () => {
          void runBulkRequestInfo();
        },
        disabled: isBulkLoading,
      });
    }

    return actions;
  }, [
    activeTab,
    canRejectLeads,
    canRequestInfoLeads,
    canVerifyLeads,
    isBulkLoading,
    runBulkRequestInfo,
    runBulkVerify,
  ]);

  const handleExportCsv = useCallback(() => {
    const dateStamp = new Date().toISOString().split("T")[0];
    const columns: CsvColumn<LeadTableItem>[] = [
      { label: "Flat Number", accessor: "flat_number" },
      { label: "Building", accessor: (row) => row.building_name ?? "" },
      { label: "Society", accessor: (row) => row.society_name ?? "" },
      { label: "Owner Name", accessor: (row) => row.owner_name ?? "" },
      { label: "Owner Phone", accessor: "owner_phone" },
      {
        label: "Status",
        accessor: "status",
        formatter: (value) =>
          String(value)
            .toLowerCase()
            .split("_")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" "),
      },
      { label: "Submitted By", accessor: (row) => row.guard_name ?? "" },
      {
        label: "Submitted At",
        accessor: "_creationTime",
        formatter: (value) =>
          typeof value === "number" ? new Date(value).toISOString().split("T")[0] : "",
      },
    ];

    exportToCsv(visibleLeads, columns, `leads-${dateStamp}.csv`);
  }, [visibleLeads]);

  if (currentUser === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (
    !currentUser ||
    !(
      currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ??
      (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS")
    )
  ) {
    return null;
  }

  if (!hasLeadsView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view leads.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Lead Queue</h2>
        <p className="text-sm text-slate-600">
          Triage incoming leads &mdash; request info, verify, reject, or flag duplicates.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <LeadStatusTabs activeTab={activeTab} counts={statusCounts} onTabChange={handleTabChange} />

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={qualityFlagFilter}
            onValueChange={(value) => {
              setQualityFlagFilter(value as QualityFlagFilter);
              setSelectedLeadId(null);
              clearBulkSelection();
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Quality Flags" />
            </SelectTrigger>
            <SelectContent>
              {QUALITY_FLAG_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={societyFilter}
            onValueChange={(v) => {
              setSocietyFilter(v);
              setSelectedLeadId(null);
              clearBulkSelection();
            }}
            disabled={!hasSocietiesView}
          >
            <SelectTrigger className="w-[250px]" disabled={!hasSocietiesView}>
              <SelectValue placeholder="All Societies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Societies</SelectItem>
              {societyOptions.map((society) => (
                <SelectItem key={society._id} value={society._id}>
                  {society.name} — {society.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={sortOrder}
            onValueChange={(value) => {
              setSortOrder(value as LeadSortOption);
              setSelectedLeadId(null);
              clearBulkSelection();
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {LEAD_SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  className="gap-1.5"
                >
                  <Download className="size-4" />
                  Export Visible Rows
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                Exports currently displayed rows only. Apply filters first for targeted exports.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <LeadTable
        statusFilter={activeTab === "ALL" ? undefined : activeTab}
        societyFilter={selectedSociety}
        qualityFlagFilter={selectedQualityFlag}
        searchText={searchText}
        searchQuery={debouncedSearch}
        onSearchTextChange={setSearchText}
        searchInputRef={searchInputRef}
        selectedLeadId={selectedLeadId}
        onSelectLead={handleSelectLead}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        canVerifyLeads={canVerifyLeads}
        canRejectLeads={canRejectLeads}
        canRequestInfoLeads={canRequestInfoLeads}
        sortOrder={sortOrder}
        onVisibleLeadsChange={setVisibleLeads}
      />

      <LeadDetailPanel
        leadId={selectedLeadId}
        permissionSet={permissionSet}
        onClose={() => handleSelectLead(null)}
        shortcutAction={shortcutAction}
        onShortcutActionHandled={() => setShortcutAction(null)}
      />

      <BulkActionBar
        selectedCount={selectedCount}
        actions={bulkActions}
        clearAction={() => {
          clearBulkSelection();
          setIsBulkRejectDialogOpen(false);
        }}
      />

      <AlertDialog open={isBulkRejectDialogOpen} onOpenChange={setIsBulkRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {selectedCount} leads?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void runBulkReject();
              }}
              disabled={isBulkLoading}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {bulkLoadingAction === "reject" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                "Confirm Reject"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
