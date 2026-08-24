"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { GUARD_TYPE } from "../../../lib/constants";

const GUARD_TYPE_LABELS: Record<string, string> = {
  [GUARD_TYPE.BUILDING_SPECIFIC]: "Building Guard",
  [GUARD_TYPE.MAIN_GATE]: "Main Gate Guard",
  [GUARD_TYPE.PARK]: "Park Guard",
  [GUARD_TYPE.ROVING]: "Roving Guard",
};

const editGuardSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  guard_type: z.enum([
    GUARD_TYPE.BUILDING_SPECIFIC,
    GUARD_TYPE.MAIN_GATE,
    GUARD_TYPE.PARK,
    GUARD_TYPE.ROVING,
  ]),
  society_id: z.string().min(1, "Society is required"),
});

type EditGuardFormValues = z.infer<typeof editGuardSchema>;

type GuardEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guard: {
    user_id: Id<"users">;
    name: string;
    guard_type: string;
    society_id: Id<"societies">;
    society_name: string | null;
  };
};

export function GuardEditDialog({ open, onOpenChange, guard }: GuardEditDialogProps) {
  const updateProfile = useMutation(api.guards.updateProfile);
  const societies = useQuery(api.societies.list, {});

  const form = useForm<EditGuardFormValues>({
    resolver: zodResolver(editGuardSchema),
    defaultValues: {
      name: guard.name,
      guard_type: guard.guard_type as EditGuardFormValues["guard_type"],
      society_id: guard.society_id,
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset({
      name: guard.name,
      guard_type: guard.guard_type as EditGuardFormValues["guard_type"],
      society_id: guard.society_id,
    });
  }, [form, open, guard.name, guard.guard_type, guard.society_id]);

  const handleDialogClose = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);

      if (!nextOpen) {
        form.reset();
      }
    },
    [onOpenChange, form],
  );

  const watchedSocietyId = form.watch("society_id");
  const isSocietyChanging = watchedSocietyId !== guard.society_id;

  const newSocietyName = useMemo(() => {
    if (!isSocietyChanging || !societies) {
      return null;
    }

    const newSociety = societies.find((s) => s._id === watchedSocietyId);
    return newSociety?.name ?? null;
  }, [isSocietyChanging, societies, watchedSocietyId]);

  async function onSubmit(values: EditGuardFormValues) {
    const updates: {
      user_id: Id<"users">;
      name?: string;
      guard_type?: string;
      society_id?: Id<"societies">;
    } = { user_id: guard.user_id };

    const trimmedName = values.name.trim();

    if (trimmedName !== guard.name) {
      updates.name = trimmedName;
    }

    if (values.guard_type !== guard.guard_type) {
      updates.guard_type = values.guard_type;
    }

    if (values.society_id !== guard.society_id) {
      updates.society_id = values.society_id as Id<"societies">;
    }

    if (!updates.name && !updates.guard_type && !updates.society_id) {
      handleDialogClose(false);
      return;
    }

    try {
      await updateProfile(updates);
      toast.success("Guard updated");
      handleDialogClose(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update guard";
      toast.error(message);
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Guard</DialogTitle>
          <DialogDescription>Update guard profile details.</DialogDescription>
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
                      placeholder="Guard's full name"
                      className="h-10 border-slate-300"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="guard_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Guard Type</FormLabel>
                  <FormControl>
                    <select
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      {Object.entries(GUARD_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="society_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Society</FormLabel>
                  <FormControl>
                    <select
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="">Select a society</option>
                      {(societies ?? []).map((society) => (
                        <option key={society._id} value={society._id}>
                          {society.name}, {society.city}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isSocietyChanging ? (
              <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <p className="text-sm text-amber-800">
                  This guard will be moved from{" "}
                  <span className="font-semibold">{guard.society_name ?? "Unknown"}</span> to{" "}
                  <span className="font-semibold">{newSocietyName ?? "Unknown"}</span>. Their
                  existing shifts will be removed and leads stay linked to the old society.
                </p>
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                Cancel
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
                  "Update Guard"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
