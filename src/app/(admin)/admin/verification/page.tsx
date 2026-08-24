"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, ShieldAlert } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  CALL_OUTCOME,
  LEAD_STATUS,
  PERMISSIONS,
  type LeadStatus,
} from "../../../../../lib/constants";
import { BulkActionBar, type BulkAction } from "@/components/admin/BulkActionBar";
import { SmartQueue } from "@/components/admin/SmartQueue";
import { VerificationDialog } from "@/components/admin/VerificationDialog";
import { VerificationTable, type VerificationLead } from "@/components/admin/VerificationTable";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type VerificationTab = "pending" | "verified" | "rejected" | "all";

const TAB_ITEMS: Array<{
  value: VerificationTab;
  label: string;
}> = [
  { value: "pending", label: "Pending Verification" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

function getTabStatusFilter(tab: VerificationTab): LeadStatus | undefined {
  if (tab === "pending") {
    return LEAD_STATUS.SUBMITTED;
  }

  if (tab === "verified") {
    return LEAD_STATUS.VERIFIED;
  }

  if (tab === "rejected") {
    return LEAD_STATUS.REJECTED;
  }

  return undefined;
}

export default function VerificationPage() {
  const [activeTab, setActiveTab] = useState<VerificationTab>("pending");
  const [selectedLead, setSelectedLead] = useState<VerificationLead | null>(null);
  const [isVerificationDialogOpen, setIsVerificationDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"leads">>>(new Set());
  const [isBulkRejectDialogOpen, setIsBulkRejectDialogOpen] = useState(false);
  const [bulkLoadingAction, setBulkLoadingAction] = useState<"verify" | "reject" | null>(null);

  const createVerification = useMutation(api.verifications.create);
  const rejectLead = useMutation(api.leads.reject);
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );

  const permissionSet = useMemo(() => {
    const permissions = new Set<string>();

    if (!roleAssignments) {
      return permissions;
    }

    for (const assignment of roleAssignments) {
      for (const permission of assignment.role.permissions) {
        permissions.add(permission);
      }
    }

    return permissions;
  }, [roleAssignments]);

  const hasLeadsVerifyPermission = permissionSet.has(PERMISSIONS.LEADS_VERIFY);
  const hasLeadsViewPermission = permissionSet.has(PERMISSIONS.LEADS_VIEW);
  const hasLeadsRejectPermission = permissionSet.has(PERMISSIONS.LEADS_REJECT);

  const statusCounts = useQuery(api.leads.getStatusCounts, hasLeadsViewPermission ? {} : "skip");

  const allCount = useMemo(() => {
    if (!statusCounts) {
      return 0;
    }

    return Object.values(statusCounts).reduce(
      (total, count) => total + (typeof count === "number" ? count : 0),
      0,
    );
  }, [statusCounts]);

  const tabCounts = useMemo(() => {
    return {
      pending: statusCounts?.[LEAD_STATUS.SUBMITTED] ?? 0,
      verified: statusCounts?.[LEAD_STATUS.VERIFIED] ?? 0,
      rejected: statusCounts?.[LEAD_STATUS.REJECTED] ?? 0,
      all: allCount,
    } as const;
  }, [allCount, statusCounts]);

  const selectedCount = selectedIds.size;
  const isBulkLoading = bulkLoadingAction !== null;

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

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
      clearSelection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to verify selected leads");
    } finally {
      setBulkLoadingAction(null);
    }
  }, [clearSelection, createVerification, selectedIds]);

  const runBulkReject = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }

    setBulkLoadingAction("reject");
    try {
      await Promise.all(
        ids.map(async (leadId) => {
          await rejectLead({
            lead_id: leadId,
            reason: "Rejected as duplicate via bulk action.",
          });
        }),
      );

      toast.success(`${ids.length} leads rejected as duplicates`);
      clearSelection();
      setIsBulkRejectDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Some leads could not be rejected: ${message}`);
    } finally {
      setBulkLoadingAction(null);
    }
  }, [clearSelection, rejectLead, selectedIds]);

  const bulkActions = useMemo<BulkAction[]>(() => {
    const actions: BulkAction[] = [];

    if (hasLeadsVerifyPermission) {
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

    if (hasLeadsRejectPermission) {
      actions.push({
        label: "Reject Selected",
        variant: "destructive",
        icon:
          bulkLoadingAction === "reject" ? <Loader2 className="size-4 animate-spin" /> : undefined,
        onClick: () => setIsBulkRejectDialogOpen(true),
        disabled: isBulkLoading,
      });
    }

    return actions;
  }, [
    bulkLoadingAction,
    hasLeadsRejectPermission,
    hasLeadsVerifyPermission,
    isBulkLoading,
    runBulkVerify,
  ]);

  if (currentUser === undefined || roleAssignments === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) { return null; }

  if (!hasLeadsVerifyPermission || !hasLeadsViewPermission) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-16 text-center">
        <ShieldAlert className="size-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Access Denied</p>
        <p className="text-sm text-slate-500">
          You do not have permission to view and verify leads.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Verification Queue</h2>
        <p className="text-sm text-slate-600">
          Review incoming leads, call owners, and record verification outcomes.
        </p>
      </div>

      <SmartQueue canReject={hasLeadsRejectPermission} />

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as VerificationTab);
          setSelectedLead(null);
          setIsVerificationDialogOpen(false);
          setIsBulkRejectDialogOpen(false);
          clearSelection();
        }}
        className="space-y-3"
      >
        <TabsList className="h-auto flex-wrap items-center justify-start rounded-xl border border-slate-200 bg-white p-1">
          {TAB_ITEMS.map((tab) => {
            const count = tabCounts[tab.value];

            return (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-2 px-3 py-2">
                <span>{tab.label}</span>
                <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-500">
                  {count}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {TAB_ITEMS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <VerificationTable
              statusFilter={getTabStatusFilter(tab.value)}
              action={(lead: VerificationLead) => {
                setSelectedLead(lead);
                setIsVerificationDialogOpen(true);
              }}
              selectedIds={selectedIds}
              selectionAction={setSelectedIds}
            />
          </TabsContent>
        ))}
      </Tabs>

      <BulkActionBar
        selectedCount={selectedCount}
        actions={bulkActions}
        clearAction={() => {
          clearSelection();
          setIsBulkRejectDialogOpen(false);
        }}
      />

      {selectedLead ? (
        <VerificationDialog
          isOpen={isVerificationDialogOpen}
          setOpenAction={(open) => {
            setIsVerificationDialogOpen(open);
            if (!open) {
              setSelectedLead(null);
            }
          }}
          lead={selectedLead}
        />
      ) : null}

      <AlertDialog open={isBulkRejectDialogOpen} onOpenChange={setIsBulkRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {selectedCount} leads as duplicates?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void runBulkReject();
              }}
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={isBulkLoading}
            >
              {bulkLoadingAction === "reject" ? "Rejecting..." : "Confirm Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
