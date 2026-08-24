"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  PERMISSIONS,
  SUPPORT_INQUIRY_STATUS,
  SUPPORT_INQUIRY_STATUS_COLORS,
  type SupportInquiryStatus,
} from "../../../../../lib/constants";
import { InquiryDetailPanel } from "./components/inquiry-detail-panel";
import { InquiryTable } from "./components/inquiry-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type StatusTabValue = "ALL" | SupportInquiryStatus;
type PersonaFilterValue = "ALL" | "TENANT" | "OWNER" | "GUARD" | "OTHER";
type ContactMethodFilterValue = "ALL" | "EMAIL" | "PHONE" | "WHATSAPP" | "IN_APP";

const STATUS_TABS: Array<{ label: string; value: StatusTabValue }> = [
  { label: "All", value: "ALL" },
  { label: "Open", value: SUPPORT_INQUIRY_STATUS.OPEN },
  { label: "In Progress", value: SUPPORT_INQUIRY_STATUS.IN_PROGRESS },
  { label: "Resolved", value: SUPPORT_INQUIRY_STATUS.RESOLVED },
  { label: "Closed", value: SUPPORT_INQUIRY_STATUS.CLOSED },
];

export default function SupportInboxPage() {
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

  const hasViewPermission = permissionSet.has(PERMISSIONS.SUPPORT_INQUIRIES_VIEW);
  const canManage = permissionSet.has(PERMISSIONS.SUPPORT_INQUIRIES_MANAGE);

  const admins = useQuery(api.admins.listAdmins, hasViewPermission ? {} : "skip");

  const statusCounts = useQuery(
    api.supportInquiries.getStatusCounts,
    hasViewPermission ? {} : "skip",
  );

  const [statusFilter, setStatusFilter] = useState<StatusTabValue>("ALL");
  const [personaTypeFilter, setPersonaTypeFilter] = useState<PersonaFilterValue>("ALL");
  const [assignedAdminFilter, setAssignedAdminFilter] = useState<string>("ALL");
  const [preferredContactFilter, setPreferredContactFilter] =
    useState<ContactMethodFilterValue>("ALL");
  const [selectedInquiryId, setSelectedInquiryId] = useState<Id<"support_inquiries"> | null>(null);

  const assignedAdminIdFilter =
    assignedAdminFilter === "ALL"
      ? undefined
      : admins?.find((admin) => admin._id === assignedAdminFilter)?._id;

  if (currentUser === undefined || roleAssignments === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) { return null; }

  if (!hasViewPermission) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view support inquiries.
      </div>
    );
  }

  const totalCount = statusCounts
    ? Object.values(statusCounts).reduce((sum, count) => sum + count, 0)
    : undefined;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Support Inbox</h2>
        <p className="text-sm text-slate-600">
          Manage incoming support requests from public contact channels.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => {
          const isActive = statusFilter === tab.value;
          const count =
            tab.value === "ALL"
              ? totalCount
              : statusCounts
                ? statusCounts[tab.value as SupportInquiryStatus]
                : undefined;

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setStatusFilter(tab.value);
                setSelectedInquiryId(null);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {tab.label}
              {count !== undefined ? (
                <span
                  className={cn(
                    "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                    isActive
                      ? "bg-white/20 text-white"
                      : tab.value === "ALL"
                        ? "bg-slate-100 text-slate-600"
                        : SUPPORT_INQUIRY_STATUS_COLORS[tab.value],
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Select
          value={personaTypeFilter}
          onValueChange={(value) => {
            setPersonaTypeFilter(value as PersonaFilterValue);
            setSelectedInquiryId(null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Filter by persona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All personas</SelectItem>
            <SelectItem value="TENANT">Tenant</SelectItem>
            <SelectItem value="OWNER">Owner</SelectItem>
            <SelectItem value="GUARD">Guard</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={assignedAdminFilter}
          onValueChange={(value) => {
            setAssignedAdminFilter(value);
            setSelectedInquiryId(null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Filter by assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All assignees</SelectItem>
            {(admins ?? []).map((admin) => (
              <SelectItem key={admin._id} value={admin._id}>
                {admin.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={preferredContactFilter}
          onValueChange={(value) => {
            setPreferredContactFilter(value as ContactMethodFilterValue);
            setSelectedInquiryId(null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Filter by contact method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All contact methods</SelectItem>
            <SelectItem value="EMAIL">Email</SelectItem>
            <SelectItem value="PHONE">Phone</SelectItem>
            <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
            <SelectItem value="IN_APP">In App</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <InquiryTable
        statusFilter={statusFilter === "ALL" ? undefined : statusFilter}
        personaTypeFilter={personaTypeFilter === "ALL" ? undefined : personaTypeFilter}
        assignedAdminFilter={assignedAdminIdFilter}
        preferredContactMethodFilter={
          preferredContactFilter === "ALL" ? undefined : preferredContactFilter
        }
        selectedId={selectedInquiryId}
        onSelect={setSelectedInquiryId}
      />

      <InquiryDetailPanel
        inquiryId={selectedInquiryId}
        onClose={() => setSelectedInquiryId(null)}
        canManage={canManage}
        currentAdminId={currentUser._id}
      />
    </div>
  );
}
