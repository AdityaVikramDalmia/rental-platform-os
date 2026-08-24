"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import {
  Building2,
  ChevronLeft,
  FileText,
  Loader2,
  Pencil,
  ShieldCheck,
  Ticket,
  UserPlus,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { api } from "../../../../../../convex/_generated/api";
import { BuildingTable } from "@/components/admin/BuildingTable";
import { BuildingCreateDialog } from "@/components/admin/BuildingCreateDialog";
import { SocietyActivityFeed } from "@/components/admin/SocietyActivityFeed";
import { SocietyGuardPerf } from "@/components/admin/SocietyGuardPerf";
import { SocietyCreateDialog } from "@/components/admin/SocietyCreateDialog";
import { SocietyGuardsTab } from "@/components/admin/SocietyGuardsTab";
import { SocietyLeadsTab } from "@/components/admin/SocietyLeadsTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LISTING_STATUS, PERMISSIONS } from "../../../../../../lib/constants";

type DetailTab = "buildings" | "guards" | "leads";
const SOCIETY_STAT_SKELETON_KEYS = ["one", "two", "three"] as const;

function statusBadgeClassName(status: "ONBOARDING" | "ACTIVE" | "INACTIVE"): string {
  if (status === "ONBOARDING") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "ACTIVE") {
    return "border-green-200 bg-green-50 text-green-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

export default function SocietyDetailPage() {
  const params = useParams<{ id: string }>();
  const societyId = params.id as Id<"societies">;
  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );
  const society = useQuery(api.societies.getById, { id: societyId });
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

  const hasBuildingsCreate = permissionSet.has(PERMISSIONS.BUILDINGS_CREATE);
  const hasGuardsCreate = permissionSet.has(PERMISSIONS.GUARDS_CREATE);
  const hasLeadsView = permissionSet.has(PERMISSIONS.LEADS_VIEW);
  const hasListingsView = permissionSet.has(PERMISSIONS.LISTINGS_VIEW);

  const listings = useQuery(
    api.listings.list,
    hasListingsView
      ? {
          society_id: societyId,
          paginationOpts: {
            numItems: 2000,
            cursor: null,
          },
        }
      : "skip",
  );

  const listingStats = useMemo(() => {
    const allListings = listings?.page ?? [];
    const activeListings = allListings.filter(
      (listing) => listing.status === LISTING_STATUS.PUBLISHED,
    ).length;

    return {
      activeListings,
      totalListings: allListings.length,
    };
  }, [listings]);

  const [activeTab, setActiveTab] = useState<DetailTab>("buildings");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddBuildingOpen, setIsAddBuildingOpen] = useState(false);

  if (society === undefined) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-5 w-96" />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {SOCIETY_STAT_SKELETON_KEYS.map((skeletonKey) => (
            <Card key={`society-stat-skeleton-${skeletonKey}`}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (society === null) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Society not found</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/admin/societies">
              <ChevronLeft className="size-4" />
              Back to Societies
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Link
          href="/admin/societies"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="size-4" />
          Societies
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {society.name}
              </h2>
              <Badge className={statusBadgeClassName(society.status)}>{society.status}</Badge>
            </div>
            <p className="text-sm text-slate-600">
              {society.city}
              {society.address ? ` - ${society.address}` : ""}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => setIsEditOpen(true)}
          >
            <Pencil className="size-4" />
            Edit
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Buildings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{society.building_count}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Guards</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{society.guard_count}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Leads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-slate-600">
            <p className="text-3xl font-semibold text-slate-900">{society.lead_stats.total}</p>
            <p>
              Submitted {society.lead_stats.submitted} • Verified {society.lead_stats.verified} •
              Rejected {society.lead_stats.rejected} • Duplicate {society.lead_stats.duplicate}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Listings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-slate-600">
            {listings === undefined && hasListingsView ? (
              <>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-4 w-36" />
              </>
            ) : hasListingsView ? (
              <>
                <p className="text-3xl font-semibold text-slate-900">
                  {listingStats.activeListings}
                </p>
                <p>
                  Active {listingStats.activeListings} • Total {listingStats.totalListings}
                </p>
                <Link
                  href="/admin/listings"
                  className="inline-flex text-xs font-medium text-slate-700 hover:underline"
                >
                  View All Listings
                </Link>
              </>
            ) : (
              <p className="text-sm text-slate-500">Listings access unavailable.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {hasBuildingsCreate && (
          <Button
            type="button"
            variant="outline"
            className="border-slate-300 text-slate-700"
            onClick={() => setIsAddBuildingOpen(true)}
          >
            <Building2 className="size-4" />
            Add Building
          </Button>
        )}

        {hasGuardsCreate && (
          <Button
            asChild
            type="button"
            variant="outline"
            className="border-slate-300 text-slate-700"
          >
            <Link href="/admin/guards">
              <UserPlus className="size-4" />
              Add Guard
            </Link>
          </Button>
        )}

        {hasLeadsView && (
          <Button
            asChild
            type="button"
            variant="outline"
            className="border-slate-300 text-slate-700"
          >
            <Link href={`/admin/leads?society=${society._id}`}>
              <FileText className="size-4" />
              View All Leads
            </Link>
          </Button>
        )}
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={activeTab === "buildings" ? "default" : "outline"}
              className={
                activeTab === "buildings"
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "border-slate-300 text-slate-700"
              }
              onClick={() => setActiveTab("buildings")}
            >
              <Building2 className="size-4" />
              Buildings
            </Button>
            <Button
              type="button"
              variant={activeTab === "guards" ? "default" : "outline"}
              className={
                activeTab === "guards"
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "border-slate-300 text-slate-700"
              }
              onClick={() => setActiveTab("guards")}
            >
              <ShieldCheck className="size-4" />
              Guards
            </Button>
            <Button
              type="button"
              variant={activeTab === "leads" ? "default" : "outline"}
              className={
                activeTab === "leads"
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "border-slate-300 text-slate-700"
              }
              onClick={() => setActiveTab("leads")}
            >
              <Ticket className="size-4" />
              Leads
            </Button>
          </div>

          {activeTab === "buildings" ? (
            <BuildingTable societyId={societyId} />
          ) : activeTab === "guards" ? (
            <SocietyGuardsTab societyId={societyId} />
          ) : (
            <SocietyLeadsTab societyId={societyId} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <SocietyActivityFeed societyId={societyId} />
        <SocietyGuardPerf societyId={societyId} />
      </div>

      <SocietyCreateDialog open={isEditOpen} action={setIsEditOpen} society={society} />
      <BuildingCreateDialog
        open={isAddBuildingOpen}
        openChangeAction={setIsAddBuildingOpen}
        societyId={societyId}
      />
    </div>
  );
}
