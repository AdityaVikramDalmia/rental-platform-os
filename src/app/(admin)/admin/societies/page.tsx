"use client";

import { useQuery } from "convex/react";
import { Building2, Download, Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { SocietyCreateDialog } from "@/components/admin/SocietyCreateDialog";
import { SocietyTable, type SocietyListItem } from "@/components/admin/SocietyTable";
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
import { PERMISSIONS, SOCIETY_STATUS } from "../../../../../lib/constants";

const STATUS_FILTER_OPTIONS = [
  { label: "All", value: "ALL" },
  { label: "Onboarding", value: SOCIETY_STATUS.ONBOARDING },
  { label: "Active", value: SOCIETY_STATUS.ACTIVE },
  { label: "Inactive", value: SOCIETY_STATUS.INACTIVE },
] as const;

type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number]["value"];

export default function SocietiesPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [visibleSocieties, setVisibleSocieties] = useState<SocietyListItem[]>([]);

  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );

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

  const hasSocietiesViewPermission = permissionSet.has(PERMISSIONS.SOCIETIES_VIEW);
  const selectedStatus = statusFilter === "ALL" ? undefined : statusFilter;
  const selectedCity = cityFilter === "ALL" ? undefined : cityFilter;

  const allSocieties = useQuery(api.societies.list, hasSocietiesViewPermission ? {} : "skip");

  const societiesFromList = useQuery(
    api.societies.list,
    hasSocietiesViewPermission
      ? {
          status: selectedStatus,
          city: selectedCity,
        }
      : "skip",
  );

  const societiesFromSearch = useQuery(
    api.societies.search,
    hasSocietiesViewPermission && debouncedSearchText.length > 0
      ? {
          search: debouncedSearchText,
          status: selectedStatus,
          city: selectedCity,
        }
      : "skip",
  );

  const cities = useMemo(() => {
    if (!allSocieties) {
      return [];
    }

    return [...new Set(allSocieties.map((society) => society.city))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [allSocieties]);

  const societies = debouncedSearchText.length > 0 ? societiesFromSearch : societiesFromList;
  const isLoading = societies === undefined;

  const handleExportCsv = () => {
    const dateStamp = new Date().toISOString().split("T")[0];
    const columns: CsvColumn<SocietyListItem>[] = [
      { label: "Name", accessor: "name" },
      { label: "City", accessor: "city" },
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
      { label: "Buildings Count", accessor: (row) => row.building_count ?? 0 },
      {
        label: "Created At",
        accessor: "_creationTime",
        formatter: (value) =>
          typeof value === "number" ? new Date(value).toISOString().split("T")[0] : "",
      },
    ];

    exportToCsv(visibleSocieties, columns, `societies-${dateStamp}.csv`);
  };

  const societiesWithCounts = useMemo(() => {
    if (!societies) {
      return [];
    }

    if (debouncedSearchText.length === 0) {
      return societies;
    }

    const countsBySocietyId = new Map(
      (allSocieties ?? []).map((society) => [society._id, society]),
    );

    return societies.map((society) => {
      const listEntry = countsBySocietyId.get(society._id);

      return {
        ...society,
        building_count: listEntry?.building_count ?? 0,
        guard_count: listEntry?.guard_count ?? 0,
        lead_count: listEntry?.lead_count ?? 0,
      };
    });
  }, [allSocieties, debouncedSearchText, societies]);

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

  if (!hasSocietiesViewPermission) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view societies.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Societies</h2>
          <p className="text-sm text-slate-600">
            Manage society onboarding, activation, and operational status.
          </p>
        </div>

        <Button
          type="button"
          className="h-10 bg-slate-900 text-white hover:bg-slate-800"
          onClick={() => setIsCreateOpen(true)}
        >
          <Plus className="size-4" />
          Add Society
        </Button>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search societies by name"
            className="h-10 border-slate-300"
          />

          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Cities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Cities</SelectItem>
              {cities.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
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
        <SocietyTable societies={[]} isLoading onVisibleSocietiesAction={setVisibleSocieties} />
      ) : societiesWithCounts.length > 0 ? (
        <SocietyTable
          societies={societiesWithCounts}
          isLoading={false}
          onVisibleSocietiesAction={setVisibleSocieties}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <Building2 className="mx-auto mb-3 size-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No societies found.</p>
          <p className="mt-1 text-sm text-slate-500">Create your first society to get started.</p>
        </div>
      )}

      <SocietyCreateDialog open={isCreateOpen} action={setIsCreateOpen} />
    </div>
  );
}
