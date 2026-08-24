"use client";

import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Loader2,
  Send,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../../convex/_generated/dataModel";
import {
  CHECKLIST_DEPTH,
  CHECKLIST_ITEM_TYPE,
  CHECKLIST_STATUS,
  CHECKLIST_STATUS_LABELS,
  type ChecklistDepth,
  type ChecklistStatus,
} from "../../../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChecklistItemField, type ItemResponseData } from "./checklist-item-field";

const DEPTH_ORDER: Record<ChecklistDepth, number> = {
  [CHECKLIST_DEPTH.LIGHT]: 0,
  [CHECKLIST_DEPTH.MEDIUM]: 1,
  [CHECKLIST_DEPTH.FULL]: 2,
};

type TemplateSection = Doc<"checklist_templates">["sections"][number];
type TemplateItem = TemplateSection["items"][number];
type ChecklistResponse = Doc<"checklist_instances">["responses"][number];

function filterSectionsByDepth(
  sections: TemplateSection[],
  depth: ChecklistDepth,
): TemplateSection[] {
  const order = DEPTH_ORDER[depth];
  return sections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => DEPTH_ORDER[i.min_depth] <= order),
    }))
    .filter((s) => s.items.length > 0);
}

function isItemComplete(response: ChecklistResponse | undefined, item: TemplateItem): boolean {
  if (!response) return false;
  if (item.requires_photo && response.photo_ids.length === 0) return false;

  switch (item.item_type) {
    case CHECKLIST_ITEM_TYPE.CONDITION:
      return response.condition_rating !== undefined;
    case CHECKLIST_ITEM_TYPE.CHECKBOX:
      return response.value === "true" || response.value === "false";
    case CHECKLIST_ITEM_TYPE.TEXT:
      return (response.value?.trim().length ?? 0) > 0;
    case CHECKLIST_ITEM_TYPE.NUMBER: {
      if ((response.value?.trim().length ?? 0) === 0) return false;
      return Number.isFinite(Number(response.value));
    }
    case CHECKLIST_ITEM_TYPE.PHOTO:
      return response.photo_ids.length > 0;
    case CHECKLIST_ITEM_TYPE.PHOTO_CONDITION:
      return response.condition_rating !== undefined && response.photo_ids.length > 0;
    default:
      return false;
  }
}

type ChecklistExecutionProps = {
  checklistId: Id<"checklist_instances">;
  onComplete?: () => void;
};

export function ChecklistExecution({ checklistId, onComplete }: ChecklistExecutionProps) {
  const instance = useQuery(api.checklists.getById, {
    checklist_id: checklistId,
  });
  const template = useQuery(
    api.checklistTemplates.getById,
    instance ? { id: instance.template_id } : "skip",
  );

  const startChecklist = useMutation(api.checklists.startChecklist);
  const updateResponseMut = useMutation(api.checklists.updateResponse);
  const submitChecklist = useMutation(api.checklists.submitChecklist);

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasAutoStarted = useRef(false);

  const sections = useMemo(() => {
    if (!template || !instance) return [];
    return filterSectionsByDepth(template.sections, instance.depth as ChecklistDepth);
  }, [template, instance]);

  const allItems = useMemo(
    () => sections.flatMap((s) => s.items.map((i) => ({ ...i, section_id: s.section_id }))),
    [sections],
  );

  const requiredItems = useMemo(() => allItems.filter((i) => i.is_required), [allItems]);

  const completedRequired = useMemo(() => {
    if (!instance) return 0;
    return requiredItems.filter((item) => {
      const resp = instance.responses.find(
        (r) => r.item_id === item.item_id && r.section_id === item.section_id,
      );
      return isItemComplete(resp, item);
    }).length;
  }, [instance, requiredItems]);

  const progressPercent =
    requiredItems.length > 0 ? Math.round((completedRequired / requiredItems.length) * 100) : 100;

  useEffect(() => {
    if (!instance || hasAutoStarted.current || isStarting) return;
    if (
      instance.status !== CHECKLIST_STATUS.ASSIGNED &&
      instance.status !== CHECKLIST_STATUS.REVISION_REQUESTED
    )
      return;

    hasAutoStarted.current = true;
    setIsStarting(true);
    startChecklist({ checklist_id: checklistId })
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : "Failed to start checklist";
        toast.error(msg);
      })
      .finally(() => setIsStarting(false));
  }, [instance, checklistId, startChecklist, isStarting]);

  const handleItemUpdate = useCallback(
    async (sectionId: string, itemId: string, data: ItemResponseData) => {
      try {
        await updateResponseMut({
          checklist_id: checklistId,
          item_id: itemId,
          section_id: sectionId,
          value: data.value,
          condition_rating: data.condition_rating,
          photo_ids: data.photo_ids,
          photo_metadata: data.photo_metadata,
          notes: data.notes,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to save response";
        toast.error(msg);
      }
    },
    [checklistId, updateResponseMut],
  );

  const isSectionComplete = useCallback(
    (section: TemplateSection) => {
      if (!instance) return false;
      return section.items
        .filter((i) => i.is_required)
        .every((item) => {
          const resp = instance.responses.find(
            (r) => r.item_id === item.item_id && r.section_id === section.section_id,
          );
          return isItemComplete(resp, item);
        });
    },
    [instance],
  );

  const canSubmit = useMemo(() => {
    if (!instance || !sections.length) return false;
    return sections.every((s) => isSectionComplete(s));
  }, [instance, sections, isSectionComplete]);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await submitChecklist({ checklist_id: checklistId });
      toast.success("Checklist submitted successfully!");
      onComplete?.();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to submit checklist";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [checklistId, submitChecklist, onComplete]);

  if (instance === undefined || (instance && template === undefined)) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-7 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!instance || !template || sections.length === 0) {
    return null;
  }

  const readOnlyStatuses: string[] = [
    CHECKLIST_STATUS.SUBMITTED,
    CHECKLIST_STATUS.UNDER_REVIEW,
    CHECKLIST_STATUS.APPROVED,
    CHECKLIST_STATUS.REJECTED,
  ];

  if (readOnlyStatuses.includes(instance.status)) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              <ClipboardCheck className="size-4" />
              Property Inspection
            </h3>
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-semibold",
                instance.status === CHECKLIST_STATUS.APPROVED &&
                  "border-emerald-300 bg-emerald-50 text-emerald-700",
                instance.status === CHECKLIST_STATUS.SUBMITTED &&
                  "border-blue-300 bg-blue-50 text-blue-700",
                instance.status === CHECKLIST_STATUS.UNDER_REVIEW &&
                  "border-amber-300 bg-amber-50 text-amber-700",
                instance.status === CHECKLIST_STATUS.REJECTED &&
                  "border-red-300 bg-red-50 text-red-700",
              )}
            >
              {CHECKLIST_STATUS_LABELS[instance.status as ChecklistStatus]}
            </Badge>
          </div>

          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>Completeness</span>
              <span className="font-mono">{instance.completeness_score}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${instance.completeness_score}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            {sections.map((section) => {
              const answered = section.items.filter((item) =>
                instance.responses.some(
                  (r) => r.item_id === item.item_id && r.section_id === section.section_id,
                ),
              ).length;
              return (
                <div
                  key={section.section_id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span className="text-sm font-medium text-slate-700">{section.title}</span>
                  <span className="text-xs text-slate-500">
                    {answered}/{section.items.length} items
                  </span>
                </div>
              );
            })}
          </div>

          {instance.review_notes && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-700">Review Notes</p>
              <p className="mt-1 text-sm text-amber-900">{instance.review_notes}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isEditable = instance.status === CHECKLIST_STATUS.IN_PROGRESS;
  const currentSection = sections[currentSectionIndex];
  const isFirstSection = currentSectionIndex === 0;
  const isLastSection = currentSectionIndex === sections.length - 1;

  if (!currentSection) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-semibold text-slate-700">
            <ClipboardCheck className="size-4" />
            Property Inspection
          </span>
          <span className="font-mono text-slate-500">
            {completedRequired}/{requiredItems.length} ({progressPercent}%)
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {isStarting && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="size-3 animate-spin" />
            Starting checklist...
          </p>
        )}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {sections.map((section, idx) => {
          const complete = isSectionComplete(section);
          const isCurrent = idx === currentSectionIndex;
          return (
            <button
              key={section.section_id}
              type="button"
              onClick={() => setCurrentSectionIndex(idx)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all",
                isCurrent
                  ? "bg-slate-900 text-white shadow-sm"
                  : complete
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {complete ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
              {section.title}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-lg font-bold text-slate-900">{currentSection.title}</h3>
        {currentSection.description && (
          <p className="mt-1 text-sm text-slate-500">{currentSection.description}</p>
        )}
      </div>

      <div className="space-y-3">
        {currentSection.items.map((item) => {
          const resp = instance.responses.find(
            (r) => r.item_id === item.item_id && r.section_id === currentSection.section_id,
          );
          return (
            <ChecklistItemField
              key={item.item_id}
              item={item}
              sectionId={currentSection.section_id}
              response={resp}
              onUpdate={(data) => handleItemUpdate(currentSection.section_id, item.item_id, data)}
              disabled={!isEditable}
            />
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isFirstSection}
            onClick={() => setCurrentSectionIndex((i) => Math.max(0, i - 1))}
            className="h-12 min-h-[44px] flex-1 rounded-xl text-base font-medium"
          >
            <ChevronLeft className="mr-1.5 size-4" />
            Previous
          </Button>

          {isLastSection ? (
            <Button
              type="button"
              disabled={!canSubmit || isSubmitting || !isEditable}
              onClick={handleSubmit}
              className="h-12 min-h-[44px] flex-1 rounded-xl bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 size-4" />
              )}
              Submit
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => setCurrentSectionIndex((i) => Math.min(sections.length - 1, i + 1))}
              className="h-12 min-h-[44px] flex-1 rounded-xl bg-slate-900 text-base font-bold text-white hover:bg-slate-800"
            >
              Next
              <ChevronRight className="ml-1.5 size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
