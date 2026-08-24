"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
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

const regenerateSchema = z.object({
  reason: z
    .string()
    .min(1, "Reason is required")
    .max(1000, "Reason must be 1000 characters or less"),
});

type RegenerateValues = z.infer<typeof regenerateSchema>;

type RegenerateChecklistDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checklistId: Id<"deal_checklists">;
  currentVersion: number;
};

export function RegenerateChecklistDialog({
  open,
  onOpenChange,
  checklistId,
  currentVersion,
}: RegenerateChecklistDialogProps) {
  const regenerate = useMutation(api.dealChecklists.regenerate);

  const form = useForm<RegenerateValues>({
    resolver: zodResolver(regenerateSchema),
    defaultValues: { reason: "" },
  });

  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [form, open]);

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: RegenerateValues) {
    try {
      await regenerate({
        checklist_id: checklistId,
        reason: values.reason.trim(),
      });
      toast.success(`Checklist regenerated — new version v${currentVersion + 1} created`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to regenerate checklist");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-amber-100">
              <RotateCcw className="size-4 text-amber-600" />
            </div>
            Regenerate Checklist
          </DialogTitle>
          <DialogDescription>
            Create a new version and supersede the current checklist.
          </DialogDescription>
        </DialogHeader>

        {/* Warning */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p className="text-xs leading-relaxed text-amber-800">
              This will create a new version (<strong>v{currentVersion + 1}</strong>) and supersede
              the current checklist. All party responses will be reset.
            </p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Regeneration</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      placeholder="e.g. Terms updated after follow-up negotiation call"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="border-amber-300 bg-amber-500 text-white hover:bg-amber-600"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-4" />
                    Regenerate
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
