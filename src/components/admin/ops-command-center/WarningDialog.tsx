"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const WARNING_LEVEL_OPTIONS = [
  {
    value: "1",
    label: "Level 1",
    description: "Initial warning for early quality or activity concern.",
  },
  {
    value: "2",
    label: "Level 2",
    description: "Escalated warning requiring manager follow-up.",
  },
  {
    value: "3",
    label: "Level 3",
    description: "Highest severity warning requiring immediate intervention.",
  },
] as const;

const TRIGGER_REASON_OPTIONS = [
  { value: "LOW_QUALITY_SCORE", label: "Low Quality Score" },
  { value: "MISSED_TARGETS", label: "Missed Targets" },
  { value: "SLA_BREACHES", label: "SLA Breaches" },
  { value: "INACTIVITY", label: "Inactivity" },
  { value: "CUSTOM", label: "Custom" },
] as const;

const warningDialogSchema = z.object({
  agent_user_id: z.string().trim().min(1, "Agent is required"),
  warning_level: z.enum(["1", "2", "3"]),
  trigger_reason: z.enum([
    "LOW_QUALITY_SCORE",
    "MISSED_TARGETS",
    "SLA_BREACHES",
    "INACTIVITY",
    "CUSTOM",
  ]),
  description: z.string().trim().min(1, "Description is required"),
  evidence: z.string().trim().optional(),
});

type WarningDialogValues = z.infer<typeof warningDialogSchema>;

type WarningDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedAgentId?: Id<"users">;
};

export function WarningDialog({ open, onOpenChange, preselectedAgentId }: WarningDialogProps) {
  const issueWarning = useMutation(api.opsManagement.issueWarning);
  const teamHealthRows = useQuery(api.opsManagement.getTeamHealthHeatmap);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<WarningDialogValues>({
    resolver: zodResolver(warningDialogSchema),
    defaultValues: {
      agent_user_id: preselectedAgentId ?? "",
      warning_level: "1",
      trigger_reason: "CUSTOM",
      description: "",
      evidence: "",
    },
  });

  const activeOpsUsers = useMemo(() => {
    if (!teamHealthRows) {
      return [];
    }

    return teamHealthRows
      .map((row) => ({ _id: row.user_id, name: row.name, phone: row.phone }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teamHealthRows]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setIsSubmitting(false);
    form.reset({
      agent_user_id: preselectedAgentId ?? "",
      warning_level: "1",
      trigger_reason: "CUSTOM",
      description: "",
      evidence: "",
    });
  }, [form, open, preselectedAgentId]);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);

      if (!nextOpen) {
        setIsSubmitting(false);
        form.reset();
      }
    },
    [form, onOpenChange],
  );

  async function onSubmit(values: WarningDialogValues) {
    setIsSubmitting(true);
    try {
      await issueWarning({
        agent_user_id: values.agent_user_id as Id<"users">,
        warning_level: Number.parseInt(values.warning_level, 10),
        trigger_type: "MANUAL",
        trigger_reason: values.trigger_reason,
        description: values.description.trim(),
        evidence: values.evidence?.trim() ? values.evidence.trim() : undefined,
      });

      toast.success("Warning issued successfully");
      handleDialogOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to issue warning";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-600" />
            Issue Warning
          </DialogTitle>
          <DialogDescription>
            Manually issue an operational warning to an active OPS agent.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="agent_user_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agent</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            teamHealthRows === undefined ? "Loading agents..." : "Select agent"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeOpsUsers.map((agent) => (
                        <SelectItem key={agent._id} value={agent._id}>
                          {agent.name}
                          {agent.phone ? ` (${agent.phone})` : ""}
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
              name="warning_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Warning Level</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange}>
                      <div className="grid gap-2">
                        {WARNING_LEVEL_OPTIONS.map((option) => (
                          <Label
                            key={option.value}
                            className="flex items-start gap-2 rounded-md border border-slate-200 p-3"
                          >
                            <RadioGroupItem value={option.value} className="mt-0.5" />
                            <span className="space-y-0.5">
                              <span className="block text-sm font-medium text-slate-900">
                                {option.label}
                              </span>
                              <span className="block text-xs text-slate-600">
                                {option.description}
                              </span>
                            </span>
                          </Label>
                        ))}
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="trigger_reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trigger Reason</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TRIGGER_REASON_OPTIONS.map((reason) => (
                        <SelectItem key={reason.value} value={reason.value}>
                          {reason.label}
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={4}
                      placeholder="Describe why this warning is being issued"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="evidence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Evidence (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      placeholder="Links, notes, or supporting context"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || activeOpsUsers.length === 0}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Issuing...
                  </>
                ) : (
                  "Issue Warning"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
