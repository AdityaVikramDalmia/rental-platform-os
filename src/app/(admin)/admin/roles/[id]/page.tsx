"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { CircleHelp, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { api } from "../../../../../../convex/_generated/api";
import { PermissionEditor } from "@/components/admin/PermissionEditor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const roleSchema = z.object({
  name: z.string().min(1, "Role name is required"),
  description: z.string().optional(),
  permissions: z.array(z.string()).min(1, "Select at least one permission"),
});

type RoleFormValues = z.infer<typeof roleSchema>;

export default function EditRolePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const roleId = params.id as Id<"roles">;

  const role = useQuery(api.roles.getById, { id: roleId });
  const updateRole = useMutation(api.roles.update);

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: "",
      description: "",
      permissions: [],
    },
  });

  useEffect(() => {
    if (!role) {
      return;
    }

    form.reset({
      name: role.name,
      description: role.description ?? "",
      permissions: role.permissions,
    });
  }, [role, form]);

  if (role === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (role === null) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Role not found</CardTitle>
          <CardDescription className="text-sm text-slate-600">
            This role was deleted or does not exist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/admin/roles">Back to Roles</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isSystemRole = role.is_system_role;
  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: RoleFormValues) {
    try {
      await updateRole({
        id: roleId,
        name: values.name,
        description: values.description?.trim() || undefined,
        permissions: values.permissions,
      });

      toast.success("Role updated");
      router.push("/admin/roles");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update role";
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Edit Role</h2>
        <p className="text-sm text-slate-600">Update role details and permissions.</p>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">{role.name}</CardTitle>
          <CardDescription className="text-sm text-slate-600">
            {isSystemRole
              ? "System role names are protected."
              : "Custom roles can be fully edited."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="h-10 border-slate-300"
                        disabled={isSystemRole}
                      />
                    </FormControl>
                    {isSystemRole ? (
                      <p className="text-xs text-slate-500">System role names cannot be changed.</p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="h-10 border-slate-300"
                        placeholder="Short description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="permissions"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel>Permissions</FormLabel>
                      {isSystemRole ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <CircleHelp className="size-4 text-slate-500" />
                            </TooltipTrigger>
                            <TooltipContent side="top" sideOffset={6}>
                              System role permissions cannot be modified
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null}
                    </div>
                    <FormControl>
                      <PermissionEditor
                        value={field.value}
                        action={field.onChange}
                        disabled={isSystemRole}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-wrap gap-2">
                <Button asChild type="button" variant="outline">
                  <Link href="/admin/roles">Cancel</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
