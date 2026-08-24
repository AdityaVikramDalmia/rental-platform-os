"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const adminCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z
    .string()
    .min(1, "Email is required")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
      message: "Enter a valid email",
    })
    .refine((value) => !value.toLowerCase().endsWith("@guards.local"), {
      message: "rental-platform-os.app emails are reserved for guards",
    }),
  initialRoleId: z.string().min(1, "Select an initial role"),
});

type AdminCreateValues = z.infer<typeof adminCreateSchema>;

type AdminCreateDialogProps = {
  roles: Doc<"roles">[];
};

export function AdminCreateDialog({ roles }: AdminCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const createAdmin = useMutation(api.admins.create);
  const assignRole = useMutation(api.userRoleAssignments.assign);

  const form = useForm<AdminCreateValues>({
    resolver: zodResolver(adminCreateSchema),
    defaultValues: {
      name: "",
      email: "",
      initialRoleId: "",
    },
  });

  const sortedRoles = useMemo(() => {
    return [...roles].sort((a, b) => a.name.localeCompare(b.name));
  }, [roles]);

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: AdminCreateValues) {
    try {
      const adminId = await createAdmin({
        name: values.name,
        email: values.email,
      });

      await assignRole({
        user_id: adminId,
        role_id: values.initialRoleId as Id<"roles">,
      });

      toast.success("Admin created and role assigned");
      form.reset();
      setOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create admin";
      toast.error(message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);

        if (!nextOpen) {
          form.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="h-10 bg-slate-900 text-white hover:bg-slate-800">
          <Plus className="size-4" />
          Create Admin
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create admin account</DialogTitle>
          <DialogDescription>
            Pre-create an admin and assign the first role before their first Google SSO
            login.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Admin name"
                      className="h-10 border-slate-300"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Google email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="admin@example.com"
                      className="h-10 border-slate-300"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="initialRoleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Initial role</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="">Select a role</option>
                      {sortedRoles.map((role) => (
                        <option key={role._id} value={role._id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || sortedRoles.length === 0}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Admin"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
