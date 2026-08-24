"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, ShieldMinus, ShieldPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type UserRoleManagerProps = {
  userId: Id<"users">;
  allRoles: Doc<"roles">[];
};

export function UserRoleManager({ userId, allRoles }: UserRoleManagerProps) {
  const assignments = useQuery(api.userRoleAssignments.getByUserId, {
    user_id: userId,
  });
  const assignRole = useMutation(api.userRoleAssignments.assign);
  const revokeRole = useMutation(api.userRoleAssignments.revoke);

  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [revokingAssignmentId, setRevokingAssignmentId] =
    useState<Id<"user_role_assignments"> | null>(null);

  const assignedRoleIds = useMemo(() => {
    return new Set((assignments ?? []).map((assignment) => assignment.role_id));
  }, [assignments]);

  const availableRoles = useMemo(() => {
    return allRoles
      .filter((role) => !assignedRoleIds.has(role._id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allRoles, assignedRoleIds]);

  async function handleAssign() {
    if (!selectedRoleId) {
      return;
    }

    try {
      setIsAssigning(true);
      await assignRole({
        user_id: userId,
        role_id: selectedRoleId as Id<"roles">,
      });
      setSelectedRoleId("");
      toast.success("Role assigned");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to assign role";
      toast.error(message);
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleRevoke(assignmentId: Id<"user_role_assignments">) {
    try {
      setRevokingAssignmentId(assignmentId);
      await revokeRole({ assignment_id: assignmentId });
      toast.success("Role revoked");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to revoke role";
      toast.error(message);
    } finally {
      setRevokingAssignmentId(null);
    }
  }

  if (assignments === undefined) {
    return (
      <div className="flex h-10 items-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" />
        Loading roles...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {assignments.length > 0 ? (
          assignments.map((assignment) => (
            <div
              key={assignment._id}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
            >
              <Badge
                variant="outline"
                className={
                  assignment.role.is_system_role
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700"
                }
              >
                {assignment.role.name}
              </Badge>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="text-slate-500 hover:bg-red-50 hover:text-red-600"
                onClick={() => handleRevoke(assignment._id)}
                disabled={revokingAssignmentId === assignment._id}
                aria-label={`Revoke ${assignment.role.name}`}
              >
                {revokingAssignmentId === assignment._id ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <ShieldMinus className="size-3" />
                )}
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No roles assigned</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedRoleId}
          onChange={(event) => setSelectedRoleId(event.target.value)}
          className="h-9 min-w-44 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900"
          disabled={availableRoles.length === 0 || isAssigning}
        >
          <option value="">Assign role...</option>
          {availableRoles.map((role) => (
            <option key={role._id} value={role._id}>
              {role.name}
            </option>
          ))}
        </select>

        <Button
          type="button"
          size="sm"
          onClick={handleAssign}
          disabled={!selectedRoleId || isAssigning}
        >
          {isAssigning ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Assigning...
            </>
          ) : (
            <>
              <ShieldPlus className="size-4" />
              Assign
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
