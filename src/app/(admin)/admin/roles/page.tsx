"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Doc } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function RolesPage() {
  const roles = useQuery(api.roles.list);
  const deleteRole = useMutation(api.roles.softDelete);
  const [roleToDelete, setRoleToDelete] = useState<Doc<"roles"> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDeleteRole() {
    if (!roleToDelete) {
      return;
    }

    try {
      setIsDeleting(true);
      await deleteRole({ id: roleToDelete._id });
      toast.success("Role deleted");
      setRoleToDelete(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete role";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }

  if (roles === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Roles Management
          </h2>
          <p className="text-sm text-slate-600">
            Manage admin permissions and protect system roles from accidental changes.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-10">
            <Link href="/admin/roles/admins">
              <Users className="size-4" />
              Manage Admins
            </Link>
          </Button>
          <Button asChild className="h-10 bg-slate-900 text-white hover:bg-slate-800">
            <Link href="/admin/roles/new">
              <Plus className="size-4" />
              New Role
            </Link>
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">All Roles</CardTitle>
          <CardDescription className="text-sm text-slate-600">
            {roles.length} role{roles.length === 1 ? "" : "s"} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3 font-medium">Name</th>
                    <th className="py-2.5 px-3 font-medium">Permissions</th>
                    <th className="py-2.5 px-3 font-medium">Type</th>
                    <th className="py-2.5 pl-3 pr-0 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role._id} className="border-b border-slate-100 text-slate-800">
                      <td className="py-3 pr-3 font-medium">{role.name}</td>
                      <td className="py-3 px-3">{role.permissions.length}</td>
                      <td className="py-3 px-3">
                        {role.is_system_role ? (
                          <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                            <ShieldCheck className="size-3" />
                            System
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-600">
                            Custom
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 pl-3 pr-0">
                        <div className="flex items-center justify-end gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/roles/${role._id}`}>Edit</Link>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setRoleToDelete(role)}
                            disabled={role.is_system_role}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No roles found. Create the first custom role.</p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={roleToDelete !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setRoleToDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete role</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold">{roleToDelete?.name}</span>
              ? This will remove it from active role selection.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRoleToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteRole}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Role"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
