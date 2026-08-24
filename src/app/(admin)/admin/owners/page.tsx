"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { Loader2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { OwnerTable } from "@/components/admin/owners/OwnerTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OWNER_LIFECYCLE_STAGE, PERMISSIONS } from "../../../../../lib/constants";

const LIFECYCLE_FILTER_OPTIONS = [
  { label: "All Stages", value: "ALL" as const },
  { label: "Prospect", value: OWNER_LIFECYCLE_STAGE.PROSPECT },
  { label: "Verified", value: OWNER_LIFECYCLE_STAGE.VERIFIED },
  { label: "Active", value: OWNER_LIFECYCLE_STAGE.ACTIVE },
  { label: "Managed", value: OWNER_LIFECYCLE_STAGE.MANAGED },
  { label: "Dormant", value: OWNER_LIFECYCLE_STAGE.DORMANT },
  { label: "Churned", value: OWNER_LIFECYCLE_STAGE.CHURNED },
] as const;

type LifecycleFilter = (typeof LIFECYCLE_FILTER_OPTIONS)[number]["value"];

export default function OwnersPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>("ALL");
  const [rmFilter, setRmFilter] = useState("ALL");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");

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

  const hasOwnersView = permissionSet.has(PERMISSIONS.OWNERS_VIEW);
  const hasGuardsView = permissionSet.has(PERMISSIONS.GUARDS_VIEW);

  const selectedLifecycle = lifecycleFilter === "ALL" ? undefined : lifecycleFilter;
  const selectedRM = rmFilter === "ALL" ? undefined : (rmFilter as Id<"guard_profiles">);

  const guards = useQuery(api.guards.list, hasGuardsView ? {} : "skip");

  const guardNameMap = useMemo(() => {
    const map: Record<string, string> = {};

    if (!guards) {
      return map;
    }

    for (const guard of guards) {
      map[guard.guard_profile_id] = guard.name;
    }

    return map;
  }, [guards]);

  const { results, status, loadMore } = usePaginatedQuery(
    api.owners.list,
    hasOwnersView
      ? {
          search: debouncedSearchText.length > 0 ? debouncedSearchText : undefined,
          lifecycle_stage: selectedLifecycle,
          current_rm_guard_id: selectedRM,
        }
      : "skip",
    { initialNumItems: 20 },
  );

  if (currentUser === undefined || roleAssignments === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!currentUser || !(currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ?? (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS"))) { return null; }

  if (!hasOwnersView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view owners.
      </div>
    );
  }

  const isLoading = status === "LoadingFirstPage";

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Owners</h2>
        <p className="text-sm text-slate-600">
          View and manage property owners across all societies.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search by phone, name, or email"
            className="h-10 border-slate-300"
          />

          <Select
            value={lifecycleFilter}
            onValueChange={(v) => setLifecycleFilter(v as LifecycleFilter)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              {LIFECYCLE_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={rmFilter} onValueChange={setRmFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All RMs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All RMs</SelectItem>
              {(guards ?? []).map((guard) => (
                <SelectItem key={guard.guard_profile_id} value={guard.guard_profile_id}>
                  {guard.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <OwnerTable owners={[]} guardNames={guardNameMap} isLoading />
      ) : results.length > 0 ? (
        <>
          <OwnerTable owners={results} guardNames={guardNameMap} isLoading={false} />
          {status === "CanLoadMore" && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => loadMore(20)}
                className="border-slate-300 text-slate-700"
              >
                Load More
              </Button>
            </div>
          )}
          {status === "LoadingMore" && (
            <div className="flex justify-center py-4">
              <Loader2 className="size-5 animate-spin text-slate-500" />
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <Users className="mx-auto mb-3 size-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No owners found.</p>
          <p className="mt-1 text-sm text-slate-500">
            Owners are auto-created when guards submit leads.
          </p>
        </div>
      )}
    </div>
  );
}
