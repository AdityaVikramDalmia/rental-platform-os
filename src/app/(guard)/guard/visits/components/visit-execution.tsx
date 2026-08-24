"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { CheckCircle2, Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  CHECKLIST_STATUS,
  CHECKLIST_STATUS_LABELS,
  VISIT_OUTCOME,
  VISIT_STATUS,
  type ChecklistStatus,
  type VisitOutcome,
  type VisitStatus,
} from "../../../../../../lib/constants";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { VoiceTextarea } from "@/components/shared/voice-textarea";
import { useLocale } from "next-intl";
import { OutcomeSelector } from "./outcome-selector";

type CompletionValues = {
  outcome: VisitOutcome;
  outcome_notes?: string;
};

type VisitExecutionProps = {
  visitId: Id<"visits">;
  status: VisitStatus;
  checklistInstanceId?: Id<"checklist_instances">;
  checklistStatus?: ChecklistStatus;
};

export function VisitExecution({
  visitId,
  status,
  checklistInstanceId,
  checklistStatus,
}: VisitExecutionProps) {
  const t = useTranslations("guard.visits");
  const tCommon = useTranslations("guard.common");
  const locale = useLocale();
  const router = useRouter();
  const startVisit = useMutation(api.visits.start);
  const completeVisit = useMutation(api.visits.complete);
  const [isStarting, setIsStarting] = useState(false);

  const completionSchema = z.object({
    outcome: z.enum(
      [VISIT_OUTCOME.INTERESTED, VISIT_OUTCOME.NOT_INTERESTED, VISIT_OUTCOME.FOLLOWUP],
      { message: t("selectOutcome") },
    ),
    outcome_notes: z
      .string()
      .max(500, t("maxChars", { max: 500 }))
      .optional(),
  });

  const form = useForm<CompletionValues>({
    resolver: zodResolver(completionSchema),
    defaultValues: {
      outcome_notes: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;
  const hasChecklistAttached = checklistInstanceId !== undefined;
  const checklistIsCompletedForVisit =
    checklistStatus === CHECKLIST_STATUS.SUBMITTED || checklistStatus === CHECKLIST_STATUS.APPROVED;
  const checklistBlocksCompletion = hasChecklistAttached && !checklistIsCompletedForVisit;
  const checklistStatusLabel = checklistStatus
    ? CHECKLIST_STATUS_LABELS[checklistStatus]
    : CHECKLIST_STATUS_LABELS[CHECKLIST_STATUS.ASSIGNED];
  const checklistBlockedMessage = checklistBlocksCompletion
    ? "Submit the attached checklist before selecting a visit outcome."
    : undefined;

  async function handleStart() {
    setIsStarting(true);
    try {
      await startVisit({ id: visitId });
      toast.success(t("visitStarted"));
    } catch (error) {
      const message = error instanceof Error ? error.message : tCommon("error");
      toast.error(message);
    } finally {
      setIsStarting(false);
    }
  }

  async function handleComplete(values: CompletionValues) {
    if (checklistBlocksCompletion) {
      toast.error("Submit the attached checklist before completing this visit.");
      return;
    }

    try {
      await completeVisit({
        id: visitId,
        outcome: values.outcome,
        outcome_notes: values.outcome_notes?.trim() || undefined,
      });
      toast.success(t("visitCompleted"));
      router.push("/guard/visits");
    } catch (error) {
      const message = error instanceof Error ? error.message : tCommon("error");
      toast.error(message);
    }
  }

  if (status === VISIT_STATUS.ASSIGNED || status === VISIT_STATUS.CONFIRMED) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          <Play className="size-4" />
          {t("visitAction")}
        </h3>
        {hasChecklistAttached ? (
          <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Checklist</p>
            <p className="text-sm font-medium text-blue-900">{checklistStatusLabel}</p>
          </div>
        ) : null}
        <Button
          onClick={handleStart}
          disabled={isStarting}
          className="h-12 w-full rounded-xl bg-slate-900 text-base font-bold text-white hover:bg-slate-800"
        >
          {isStarting ? <Loader2 className="size-5 animate-spin" /> : t("startVisit")}
        </Button>
      </div>
    );
  }

  if (status === VISIT_STATUS.IN_PROGRESS) {
    return (
      <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-amber-700">
          <CheckCircle2 className="size-4" />
          {t("completeVisit")}
        </h3>
        {hasChecklistAttached ? (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Checklist</p>
            <p className="text-sm font-medium text-blue-900">{checklistStatusLabel}</p>
          </div>
        ) : null}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleComplete)} className="space-y-4">
            <FormField
              control={form.control}
              name="outcome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-slate-700">
                    {t("howDidItGo")} <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <OutcomeSelector
                      value={field.value as VisitOutcome | undefined}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                      blockedMessage={checklistBlockedMessage}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="outcome_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-slate-700">
                    {t("notesOptional")}
                  </FormLabel>
                  <FormControl>
                    <VoiceTextarea
                      {...field}
                      maxLength={500}
                      rows={3}
                      placeholder={t("notesPlaceholder")}
                      disabled={isSubmitting}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                      language={locale}
                      entityType="visit"
                      entityId={visitId}
                      onValueChange={(v) =>
                        form.setValue("outcome_notes", v, { shouldDirty: true })
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={isSubmitting || checklistBlocksCompletion}
              className="h-12 w-full rounded-xl bg-slate-900 text-base font-bold text-white hover:bg-slate-800"
            >
              {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : t("submitComplete")}
            </Button>
          </form>
        </Form>
      </div>
    );
  }

  return null;
}
