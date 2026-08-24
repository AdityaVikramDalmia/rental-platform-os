"use client";

import { useQuery } from "convex/react";
import { Download, FileSearch, Loader2, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import { LISTING_STATUS, PERMISSIONS, type ListingStatus } from "../../../../../lib/constants";
import { ListingStatusTabs } from "./components/listing-status-tabs";
import { ListingTable, type ListingTableItem } from "./components/listing-table";
import { ListingForm } from "./components/listing-form";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type CsvColumn, exportToCsv } from "@/lib/export-csv";
import { paiseToRupees } from "../../../../../lib/money";

const VALID_STATUSES = new Set<string>(Object.values(LISTING_STATUS));

function parseStatusParam(param: string | null): ListingStatus | "ALL" {
  if (param && VALID_STATUSES.has(param)) {
    return param as ListingStatus;
  }
  return "ALL";
}

export default function ListingsPage() {
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

  const hasListingsView = permissionSet.has(PERMISSIONS.LISTINGS_VIEW);
  const hasListingsCreate = permissionSet.has(PERMISSIONS.LISTINGS_CREATE);
  const activeTab = parseStatusParam(searchParams.get("status"));
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [visibleListings, setVisibleListings] = useState<ListingTableItem[]>([]);

  const handleTabChange = useCallback(
    (tab: ListingStatus | "ALL") => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "ALL") {
        params.delete("status");
      } else {
        params.set("status", tab);
      }
      router.replace(`/admin/listings?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleExportCsv = () => {
    const dateStamp = new Date().toISOString().split("T")[0];
    const columns: CsvColumn<ListingTableItem>[] = [
      {
        label: "Title",
        accessor: (row) => `${row.bhk_config} ${row.building_name ?? ""} / Fl${row.floor_number}`,
      },
      { label: "Society", accessor: (row) => row.society_name ?? "" },
      { label: "BHK", accessor: "bhk_config" },
      {
        label: "Rent (₹)",
        accessor: "rent_monthly",
        formatter: (value) =>
          typeof value === "number" ? String(Math.round(paiseToRupees(value))) : "",
      },
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
        label: "Published At",
        accessor: "_creationTime",
        formatter: (value) =>
          typeof value === "number" ? new Date(value).toISOString().split("T")[0] : "",
      },
    ];

    exportToCsv(visibleListings, columns, `listings-${dateStamp}.csv`);
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

  if (!hasListingsView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view listings.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Listings</h2>
          <p className="text-sm text-slate-600">
            Manage property listings &mdash; create from verified leads, publish, and track
            inquiries.
          </p>
        </div>

        {hasListingsCreate && (
          <Button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
          >
            <Plus className="size-4" />
            Create Listing
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ListingStatusTabs activeTab={activeTab} onTabChange={handleTabChange} />

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

      <ListingTable
        statusFilter={activeTab === "ALL" ? undefined : activeTab}
        onVisibleListingsChange={setVisibleListings}
      />

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Create Listing</SheetTitle>
            <SheetDescription>Create a new listing from a verified lead.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <ListingForm mode="create" onSuccess={() => setIsCreateOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
