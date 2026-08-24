"use client";

import { useMutation } from "convex/react";
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
import {
  ChecklistItemField,
  type ItemResponseData,
} from "../../../../(guard)/guard/visits/components/checklist-item-field";

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
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => DEPTH_ORDER[item.min_depth] <= order),
    }))
    .filter((section) => section.items.length > 0);
}

function isItemComplete(response: ChecklistResponse | undefined, item: TemplateItem): boolean {
  if (!response) {
    return false;
  }

  if (item.requires_photo && response.photo_ids.length === 0) {
    return false;
  }

  switch (item.item_type) {
    case CHECKLIST_ITEM_TYPE.CONDITION:
      return response.condition_rating !== undefined;
    case CHECKLIST_ITEM_TYPE.CHECKBOX:
      return response.value === "true" || response.value === "false";
    case CHECKLIST_ITEM_TYPE.TEXT:
      return (response.value?.trim().length ?? 0) > 0;
    case CHECKLIST_ITEM_TYPE.NUMBER:
      if ((response.value?.trim().length ?? 0) === 0) {
        return false;
      }
      return Number.isFinite(Number(response.value));
    case CHECKLIST_ITEM_TYPE.PHOTO:
      return response.photo_ids.length > 0;
    case CHECKLIST_ITEM_TYPE.PHOTO_CONDITION:
      return response.condition_rating !== undefined && response.photo_ids.length > 0;
    default:
      return false;
  }
}

type HandoverChecklistFormProps = {
  checklistId: Id<"checklist_instances">;
  instance: Doc<"checklist_instances">;
  template: Doc<"checklist_templates">;
  onSubmitted?: () => void;
};

export function HandoverChecklistForm({
  checklistId,
  instance,
  template,
  onSubmitted,
}: HandoverChecklistFormProps) {
  const startChecklist = useMutation(api.checklists.startChecklist);
  const updateResponse = useMutation(api.checklists.updateResponse);
  const submitChecklist = useMutation(api.checklists.submitChecklist);

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasAutoStarted = useRef(false);

  const sections = useMemo(() => {
    return filterSectionsByDepth(template.sections, instance.depth as ChecklistDepth);
  }, [instance.depth, template.sections]);

  const allItems = useMemo(
    () =>
      sections.flatMap((section) =>
        section.items.map((item) => ({ ...item, section_id: section.section_id })),
      ),
    [sections],
  );

  const requiredItems = useMemo(() => allItems.filter((item) => item.is_required), [allItems]);

  const completedRequiredCount = useMemo(() => {
    return requiredItems.filter((item) => {
      const response = instance.responses.find(
        (entry) => entry.item_id === item.item_id && entry.section_id === item.section_id,
      );
      return isItemComplete(response, item);
    }).length;
  }, [instance.responses, requiredItems]);

  const progressPercent =
    requiredItems.length === 0
      ? 100
      : Math.round((completedRequiredCount / requiredItems.length) * 100);

  useEffect(() => {
    if (instance.status !== CHECKLIST_STATUS.ASSIGNED || hasAutoStarted.current || isStarting) {
      return;
    }

    hasAutoStarted.current = true;
    setIsStarting(true);
    startChecklist({ checklist_id: checklistId })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Failed to start handover checklist";
        toast.error(message);
      })
      .finally(() => {
        setIsStarting(false);
      });
  }, [checklistId, instance.status, isStarting, startChecklist]);

  useEffect(() => {
    if (currentSectionIndex > sections.length - 1) {
      setCurrentSectionIndex(Math.max(0, sections.length - 1));
    }
  }, [currentSectionIndex, sections.length]);

  const handleItemUpdate = useCallback(
    async (sectionId: string, itemId: string, data: ItemResponseData) => {
      try {
        await updateResponse({
          checklist_id: checklistId,
          section_id: sectionId,
          item_id: itemId,
          value: data.value,
          condition_rating: data.condition_rating,
          photo_ids: data.photo_ids,
          photo_metadata: data.photo_metadata,
          notes: data.notes,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to save checklist response";
        toast.error(message);
      }
    },
    [checklistId, updateResponse],
  );

  const isSectionComplete = useCallback(
    (section: TemplateSection) => {
      return section.items
        .filter((item) => item.is_required)
        .every((item) => {
          const response = instance.responses.find(
            (entry) => entry.item_id === item.item_id && entry.section_id === section.section_id,
          );
          return isItemComplete(response, item);
        });
    },
    [instance.responses],
  );

  const canSubmit = useMemo(() => {
    if (instance.status !== CHECKLIST_STATUS.IN_PROGRESS || sections.length === 0) {
      return false;
    }

    return sections.every((section) => isSectionComplete(section));
  }, [instance.status, isSectionComplete, sections]);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await submitChecklist({ checklist_id: checklistId });
      toast.success("Handover checklist submitted");
      onSubmitted?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit handover checklist";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [checklistId, onSubmitted, submitChecklist]);

  const readOnlyStatuses: ChecklistStatus[] = [
    CHECKLIST_STATUS.SUBMITTED,
    CHECKLIST_STATUS.UNDER_REVIEW,
    CHECKLIST_STATUS.APPROVED,
    CHECKLIST_STATUS.REJECTED,
  ];
  const isReadOnly = readOnlyStatuses.includes(instance.status as ChecklistStatus);
  const isEditable = instance.status === CHECKLIST_STATUS.IN_PROGRESS;

  const currentSection = sections[currentSectionIndex];
  const isFirstSection = currentSectionIndex === 0;
  const isLastSection = currentSectionIndex === sections.length - 1;

  if (!currentSection) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
        <p className="text-sm font-medium text-slate-700">No checklist sections available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-semibold text-slate-700">
            <ClipboardCheck className="size-4 text-emerald-700" />
            Move-in Handover
          </span>
          <Badge
            variant="outline"
            className={cn(
              "font-semibold",
              instance.status === CHECKLIST_STATUS.IN_PROGRESS &&
                "border-emerald-300 bg-emerald-50 text-emerald-700",
              instance.status === CHECKLIST_STATUS.ASSIGNED &&
                "border-blue-300 bg-blue-50 text-blue-700",
              instance.status === CHECKLIST_STATUS.SUBMITTED &&
                "border-indigo-300 bg-indigo-50 text-indigo-700",
              instance.status === CHECKLIST_STATUS.UNDER_REVIEW &&
                "border-amber-300 bg-amber-50 text-amber-700",
              instance.status === CHECKLIST_STATUS.APPROVED &&
                "border-emerald-400 bg-emerald-50 text-emerald-700",
              instance.status === CHECKLIST_STATUS.REJECTED &&
                "border-red-300 bg-red-50 text-red-700",
            )}
          >
            {CHECKLIST_STATUS_LABELS[instance.status as ChecklistStatus]}
          </Badge>
        </div>

        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>Required completion</span>
          <span className="font-mono">
            {completedRequiredCount}/{requiredItems.length} ({progressPercent}%)
          </span>
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {isStarting ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="size-3 animate-spin" />
            Starting checklist...
          </p>
        ) : null}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {sections.map((section, index) => {
          const complete = isSectionComplete(section);
          const isCurrent = index === currentSectionIndex;
          return (
            <button
              key={section.section_id}
              type="button"
              onClick={() => setCurrentSectionIndex(index)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all",
                isCurrent
                  ? "bg-emerald-600 text-white shadow-sm"
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
        {currentSection.description ? (
          <p className="mt-1 text-sm text-slate-500">{currentSection.description}</p>
        ) : null}
      </div>

      <div className="space-y-3">
        {currentSection.items.map((item) => {
          const response = instance.responses.find(
            (entry) =>
              entry.item_id === item.item_id && entry.section_id === currentSection.section_id,
          );

          return (
            <ChecklistItemField
              key={item.item_id}
              item={item}
              sectionId={currentSection.section_id}
              response={response}
              onUpdate={(data) => handleItemUpdate(currentSection.section_id, item.item_id, data)}
              disabled={!isEditable}
            />
          );
        })}
      </div>

      {!isReadOnly ? (
        <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isFirstSection}
              onClick={() => setCurrentSectionIndex((index) => Math.max(0, index - 1))}
              className="h-12 min-h-[44px] flex-1 rounded-xl text-base font-medium"
            >
              <ChevronLeft className="mr-1.5 size-4" />
              Previous
            </Button>

            {isLastSection ? (
              <Button
                type="button"
                disabled={!canSubmit || isSubmitting}
                onClick={handleSubmit}
                className="h-12 min-h-[44px] flex-1 rounded-xl bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 size-4" />
                )}
                Submit Handover
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() =>
                  setCurrentSectionIndex((index) => Math.min(sections.length - 1, index + 1))
                }
                className="h-12 min-h-[44px] flex-1 rounded-xl bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700"
              >
                Next
                <ChevronRight className="ml-1.5 size-4" />
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
