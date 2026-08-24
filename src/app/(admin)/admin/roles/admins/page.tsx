"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { AdminCreateDialog } from "@/components/admin/AdminCreateDialog";
import { UserRoleManager } from "@/components/admin/UserRoleManager";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AdminRolesManagementPage() {
  const admins = useQuery(api.admins.listAdmins);
  const roles = useQuery(api.roles.list);

  if (admins === undefined || roles === undefined) {
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
            Admin Role Assignment
          </h2>
          <p className="text-sm text-slate-600">
            Create admin accounts and manage role assignment in real-time.
          </p>
        </div>

        <AdminCreateDialog roles={roles} />
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Admins</CardTitle>
          <CardDescription className="text-sm text-slate-600">
            {admins.length} admin account{admins.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {admins.length > 0 ? (
            <div className="space-y-4">
              {admins.map((admin) => (
                <div
                  key={admin._id}
                  className="rounded-lg border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-slate-900">{admin.name}</h3>
                      <p className="text-sm text-slate-600">{admin.email ?? "No email"}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {admin.roles.length > 0 ? (
                          admin.roles.map((role) => (
                            <Badge
                              key={role._id}
                              variant="outline"
                              className={
                                role.is_system_role
                                  ? "border-blue-200 bg-blue-50 text-blue-700"
                                  : "border-slate-200 bg-white text-slate-700"
                              }
                            >
                              {role.name}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="text-slate-500">
                            No role assigned
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="min-w-72">
                      <UserRoleManager userId={admin._id} allRoles={roles} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No admin accounts found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
