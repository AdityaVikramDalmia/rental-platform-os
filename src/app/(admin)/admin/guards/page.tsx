"use client";

import { useQuery } from "convex/react";
import { Download, Loader2, Plus, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { GuardCreateDialog } from "@/components/admin/GuardCreateDialog";
import { OpsCreateDialog } from "@/components/admin/OpsCreateDialog";
import { GuardTable, type GuardListItem } from "@/components/admin/GuardTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type CsvColumn, exportToCsv } from "@/lib/export-csv";
import { GUARD_TYPE, PERMISSIONS, USER_STATUS } from "../../../../../lib/constants";

const PERSONA_FILTER_OPTIONS = [
  { label: "Guards", value: "GUARD" },
  { label: "OPS", value: "OPS" },
  { label: "All Field Workers", value: "ALL" },
] as const;

const STATUS_FILTER_OPTIONS = [
  { label: "All", value: "ALL" },
  { label: "Active", value: USER_STATUS.ACTIVE },
  { label: "Inactive", value: USER_STATUS.INACTIVE },
  { label: "Banned", value: USER_STATUS.BANNED },
] as const;

const TYPE_FILTER_OPTIONS = [
  { label: "All Types", value: "ALL" },
  { label: "Building", value: GUARD_TYPE.BUILDING_SPECIFIC },
  { label: "Main Gate", value: GUARD_TYPE.MAIN_GATE },
  { label: "Park", value: GUARD_TYPE.PARK },
  { label: "Roving", value: GUARD_TYPE.ROVING },
] as const;

type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number]["value"];
type TypeFilter = (typeof TYPE_FILTER_OPTIONS)[number]["value"];
type PersonaFilter = (typeof PERSONA_FILTER_OPTIONS)[number]["value"];

function isPersonaFilter(value: string | null): value is PersonaFilter {
  return value === "GUARD" || value === "OPS" || value === "ALL";
}

// V1: ~50 guards, pagination deferred
export default function GuardsPage() {
  const searchParams = useSearchParams();
  const currentUser = useQuery(api.users.getCurrentUser);
  const personaFilterFromUrl = useMemo<PersonaFilter>(() => {
    const rawPersonaFilter = searchParams.get("persona_filter");
    return isPersonaFilter(rawPersonaFilter) ? rawPersonaFilter : "GUARD";
  }, [searchParams]);
  const [personaFilter, setPersonaFilter] = useState<PersonaFilter>(personaFilterFromUrl);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [societyFilter, setSocietyFilter] = useState("ALL");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreateOpsDialogOpen, setIsCreateOpsDialogOpen] = useState(false);
  const [visibleGuards, setVisibleGuards] = useState<GuardListItem[]>([]);

  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );

  useEffect(() => {
    setPersonaFilter(personaFilterFromUrl);
  }, [personaFilterFromUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchText(searchText.trim());
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchText]);

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

  const hasGuardsViewPermission = permissionSet.has(PERMISSIONS.GUARDS_VIEW);
  const hasGuardsCreatePermission = permissionSet.has(PERMISSIONS.GUARDS_CREATE);
  const canCreateOps = hasGuardsCreatePermission && permissionSet.has(PERMISSIONS.ROLES_MANAGE);
  const hasSocietiesViewPermission = permissionSet.has(PERMISSIONS.SOCIETIES_VIEW);

  const selectedStatus = statusFilter === "ALL" ? undefined : statusFilter;
  const selectedType = typeFilter === "ALL" ? undefined : typeFilter;
  const selectedSociety = societyFilter === "ALL" ? undefined : societyFilter;

  const societies = useQuery(api.societies.list, hasSocietiesViewPermission ? {} : "skip");

  const guards = useQuery(
    api.guards.list,
    hasGuardsViewPermission
      ? {
          society_id:
            selectedSociety !== undefined ? (selectedSociety as Id<"societies">) : undefined,
          persona_filter: personaFilter,
          guard_type: selectedType,
          status: selectedStatus,
          search: debouncedSearchText.length > 0 ? debouncedSearchText : undefined,
        }
      : "skip",
  );

  const isLoading = guards === undefined;

  const handleExportCsv = () => {
    const dateStamp = new Date().toISOString().split("T")[0];
    const columns: CsvColumn<GuardListItem>[] = [
      { label: "Name", accessor: "name" },
      { label: "Phone", accessor: (row) => row.phone ?? "" },
      {
        label: "Persona",
        accessor: (row) => row.persona,
      },
      {
        label: "Guard Type",
        accessor: "guard_type",
        formatter: (value) => {
          if (value === GUARD_TYPE.BUILDING_SPECIFIC) return "Building";
          if (value === GUARD_TYPE.MAIN_GATE) return "Main Gate";
          if (value === GUARD_TYPE.PARK) return "Park";
          if (value === GUARD_TYPE.ROVING) return "Roving";
          return String(value ?? "");
        },
      },
      { label: "Society", accessor: (row) => row.society_name ?? "" },
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
      {
        label: "Created At",
        accessor: "_creationTime",
        formatter: (value) =>
          typeof value === "number" ? new Date(value).toISOString().split("T")[0] : "",
      },
    ];

    exportToCsv(visibleGuards, columns, `guards-${dateStamp}.csv`);
  };

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

  if (!hasGuardsViewPermission) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view guards.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Guards</h2>
          <p className="text-sm text-slate-600">
            Manage field-worker accounts, assignments, and operational status.
          </p>
        </div>

        {hasGuardsCreatePermission ? (
          <div className="flex items-center gap-2">
            {canCreateOps ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 border-slate-300 text-slate-700"
                onClick={() => setIsCreateOpsDialogOpen(true)}
              >
                <Plus className="size-4" />
                Add OPS
              </Button>
            ) : null}

            <Button
              type="button"
              className="h-10 bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="size-4" />
              Add Guard
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto]">
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search field workers by name or phone"
            className="h-10 border-slate-300"
          />

          <Select value={personaFilter} onValueChange={(v) => setPersonaFilter(v as PersonaFilter)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERSONA_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={societyFilter} onValueChange={setSocietyFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Societies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Societies</SelectItem>
              {(societies ?? []).map((society) => (
                <SelectItem key={society._id} value={society._id}>
                  {society.name} — {society.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="gap-1.5 self-center"
          >
            <Download className="size-4" />
            Export Visible Rows
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTER_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={statusFilter === option.value ? "default" : "outline"}
              className={
                statusFilter === option.value
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "border-slate-300 text-slate-700"
              }
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <GuardTable guards={[]} isLoading onVisibleAction={setVisibleGuards} />
      ) : guards.length > 0 ? (
        <GuardTable guards={guards} isLoading={false} onVisibleAction={setVisibleGuards} />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <ShieldCheck className="mx-auto mb-3 size-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No field workers found.</p>
          <p className="mt-1 text-sm text-slate-500">
            {personaFilter === "OPS"
              ? "Add your first OPS user to get started."
              : "Add your first guard to get started."}
          </p>
        </div>
      )}

      {hasGuardsCreatePermission ? (
        <GuardCreateDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
      ) : null}
      {canCreateOps ? (
        <OpsCreateDialog open={isCreateOpsDialogOpen} action={setIsCreateOpsDialogOpen} />
      ) : null}
    </div>
  );
}
