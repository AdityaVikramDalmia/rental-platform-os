"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2, UserRoundCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PERMISSIONS } from "../../../../lib/constants";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const reassignSchema = z.object({
  target_guard_id: z.string().min(1, "Select a target guard"),
  reason: z.string().trim().min(1, "Reassignment reason is required"),
});

type ReassignValues = z.infer<typeof reassignSchema>;

type ReassignRmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: Id<"owner_rm_assignments">;
  ownerName: string;
  currentRmName: string;
};

export function ReassignRmDialog({
  open,
  onOpenChange,
  assignmentId,
  ownerName,
  currentRmName,
}: ReassignRmDialogProps) {
  const reassignMutation = useMutation(api.rmAssignments.reassign);
  const guards = useQuery(api.guards.list, open ? {} : "skip");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ReassignValues>({
    resolver: zodResolver(reassignSchema),
    defaultValues: {
      target_guard_id: "",
      reason: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    setIsSubmitting(false);
    form.reset();
  }, [form, open]);

  const handleDialogClose = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        setIsSubmitting(false);
        form.reset();
      }
    },
    [form, onOpenChange],
  );

  async function onSubmit(values: ReassignValues) {
    const selectedGuard = guards?.find((g) => g.guard_profile_id === values.target_guard_id);
    if (!selectedGuard) {
      toast.error("Selected guard not found");
      return;
    }

    setIsSubmitting(true);
    try {
      await reassignMutation({
        assignment_id: assignmentId,
        new_rm_guard_id: selectedGuard.guard_profile_id as Id<"guard_profiles">,
        new_rm_user_id: selectedGuard.user_id,
        reason: values.reason,
      });
      toast.success("RM reassigned successfully");
      handleDialogClose(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reassign RM";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const activeGuards = (guards ?? []).filter((g) => g.status === "ACTIVE");

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRoundCog className="size-5 text-slate-600" />
            Reassign Relationship Manager
          </DialogTitle>
          <DialogDescription>
            Reassign RM for owner <span className="font-medium text-slate-700">{ownerName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
          <span className="text-slate-500">Current RM:</span>{" "}
          <span className="font-medium text-slate-700">{currentRmName}</span>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="target_guard_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New RM Guard</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a guard" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeGuards.map((guard) => (
                        <SelectItem key={guard.guard_profile_id} value={guard.guard_profile_id}>
                          {guard.name}
                          {guard.phone ? ` (${guard.phone})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for reassignment</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Explain why this RM is being reassigned"
                      className="border-slate-300"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Reassigning...
                  </>
                ) : (
                  "Reassign RM"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
