"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
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
import { Textarea } from "@/components/ui/textarea";

const activateSchema = z.object({
  ops_notes: z
    .string()
    .trim()
    .max(500, "Notes cannot exceed 500 characters")
    .optional()
    .or(z.literal("")),
});

type ActivateFormValues = z.infer<typeof activateSchema>;

type ActivateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: Id<"owner_service_requests">;
  ownerName: string;
};

export function ActivateDialog({ open, onOpenChange, requestId, ownerName }: ActivateDialogProps) {
  const activate = useMutation(api.ownerServiceRequests.activate);
  const form = useForm<ActivateFormValues>({
    resolver: zodResolver(activateSchema),
    defaultValues: {
      ops_notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({ ops_notes: "" });
    }
  }, [form, open]);

  const onSubmit = async (values: ActivateFormValues) => {
    try {
      await activate({
        id: requestId,
        ops_notes: values.ops_notes?.trim() || undefined,
      });
      toast.success("Owner activated successfully.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to activate owner");
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activate Owner</DialogTitle>
          <DialogDescription>
            Confirm activation for <span className="font-medium text-slate-900">{ownerName}</span>.
            This moves the request from ONBOARDED to ACTIVE.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className="space-y-3 py-2">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                The owner account is already onboarded. Activation marks this owner as live and
                service-ready.
              </div>

              <FormField
                control={form.control}
                name="ops_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g. Onboarding verified, services activated"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Activating..." : "Activate Owner"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
