"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHECKLIST_ITEM_TYPE,
  CONDITION_RATING,
  CONDITION_RATING_LABELS,
  type ConditionRating,
} from "../../../../../../lib/constants";
import type { Doc, Id } from "../../../../../../convex/_generated/dataModel";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ChecklistPhotoInput } from "./checklist-photo-input";

type TemplateItem = Doc<"checklist_templates">["sections"][number]["items"][number];
type ChecklistResponse = Doc<"checklist_instances">["responses"][number];
type PhotoMeta = ChecklistResponse["photo_metadata"][number];

export type ItemResponseData = {
  value?: string;
  condition_rating?: ConditionRating;
  photo_ids: Id<"_storage">[];
  photo_metadata: PhotoMeta[];
  notes?: string;
};

type ChecklistItemFieldProps = {
  item: TemplateItem;
  sectionId: string;
  response: ChecklistResponse | undefined;
  onUpdate: (data: ItemResponseData) => void;
  disabled?: boolean;
};

const CONDITION_COLORS: Record<ConditionRating, { active: string; inactive: string }> = {
  [CONDITION_RATING.EXCELLENT]: {
    active: "bg-emerald-600 text-white border-emerald-600",
    inactive: "border-emerald-300 text-emerald-700 hover:bg-emerald-50",
  },
  [CONDITION_RATING.GOOD]: {
    active: "bg-teal-600 text-white border-teal-600",
    inactive: "border-teal-300 text-teal-700 hover:bg-teal-50",
  },
  [CONDITION_RATING.FAIR]: {
    active: "bg-amber-500 text-white border-amber-500",
    inactive: "border-amber-300 text-amber-700 hover:bg-amber-50",
  },
  [CONDITION_RATING.POOR]: {
    active: "bg-red-600 text-white border-red-600",
    inactive: "border-red-300 text-red-700 hover:bg-red-50",
  },
  [CONDITION_RATING.NA]: {
    active: "bg-slate-500 text-white border-slate-500",
    inactive: "border-slate-300 text-slate-500 hover:bg-slate-50",
  },
};

const RATINGS_ORDER: ConditionRating[] = [
  CONDITION_RATING.EXCELLENT,
  CONDITION_RATING.GOOD,
  CONDITION_RATING.FAIR,
  CONDITION_RATING.POOR,
  CONDITION_RATING.NA,
];

const DEBOUNCE_MS = 300;

function initLocalState(response: ChecklistResponse | undefined): ItemResponseData {
  return {
    value: response?.value,
    condition_rating: response?.condition_rating as ConditionRating | undefined,
    photo_ids: response?.photo_ids ?? [],
    photo_metadata: response?.photo_metadata ?? [],
    notes: response?.notes,
  };
}

export function ChecklistItemField({
  item,
  sectionId: _sectionId,
  response,
  onUpdate,
  disabled,
}: ChecklistItemFieldProps) {
  const [showNotes, setShowNotes] = useState(() => (response?.notes?.length ?? 0) > 0);

  const [local, setLocal] = useState<ItemResponseData>(() => initLocalState(response));
  const localRef = useRef(local);
  useEffect(() => {
    localRef.current = local;
  }, [local]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync non-text fields from server to prevent overwriting user's in-progress typing.
  // Adjusted directly during render (React's documented pattern for "adjusting state
  // when a prop changes") rather than in an effect, since this only needs to run when
  // the `response` identity actually changes, not on every render.
  const [prevResponse, setPrevResponse] = useState(response);
  if (response !== prevResponse) {
    setPrevResponse(response);
    if (response) {
      setLocal((current) => ({
        ...current,
        condition_rating: response.condition_rating as ConditionRating | undefined,
        photo_ids: response.photo_ids,
        photo_metadata: response.photo_metadata,
      }));
    }
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const update = useCallback(
    (patch: Partial<ItemResponseData>, debounce = false) => {
      const next = { ...localRef.current, ...patch };
      setLocal(next);
      localRef.current = next;

      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }

      if (debounce) {
        debounceRef.current = setTimeout(() => {
          onUpdate(localRef.current);
        }, DEBOUNCE_MS);
      } else {
        onUpdate(next);
      }
    },
    [onUpdate],
  );

  const handleConditionChange = useCallback(
    (rating: ConditionRating) => {
      if (disabled) return;
      update({ condition_rating: rating });
    },
    [disabled, update],
  );

  const handleCheckboxChange = useCallback(
    (checked: boolean) => {
      if (disabled) return;
      update({ value: checked ? "true" : "false" });
    },
    [disabled, update],
  );

  const handleTextChange = useCallback(
    (value: string) => {
      if (disabled) return;
      update({ value }, true);
    },
    [disabled, update],
  );

  const handleNumberChange = useCallback(
    (value: string) => {
      if (disabled) return;
      update({ value }, true);
    },
    [disabled, update],
  );

  const handleNotesChange = useCallback(
    (value: string) => {
      if (disabled) return;
      update({ notes: value || undefined }, true);
    },
    [disabled, update],
  );

  const handlePhotosChange = useCallback(
    (ids: Id<"_storage">[], metadata: PhotoMeta[]) => {
      if (disabled) return;
      update({ photo_ids: ids, photo_metadata: metadata });
    },
    [disabled, update],
  );

  const needsPhoto =
    item.requires_photo ||
    item.item_type === CHECKLIST_ITEM_TYPE.PHOTO ||
    item.item_type === CHECKLIST_ITEM_TYPE.PHOTO_CONDITION;

  const showCondition =
    item.item_type === CHECKLIST_ITEM_TYPE.CONDITION ||
    item.item_type === CHECKLIST_ITEM_TYPE.PHOTO_CONDITION;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5">
          <span className="text-base font-semibold text-slate-800">{item.label}</span>
          {item.is_required && <span className="mt-0.5 text-sm font-bold text-red-500">*</span>}
        </div>
        {needsPhoto && (
          <span className="shrink-0 text-lg" title="Photo required">
            📷
          </span>
        )}
      </div>

      <div className="space-y-3">
        {showCondition && (
          <div className="flex gap-1.5">
            {RATINGS_ORDER.map((rating) => {
              const isSelected = local.condition_rating === rating;
              const colors = CONDITION_COLORS[rating];
              return (
                <button
                  key={rating}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleConditionChange(rating)}
                  className={cn(
                    "min-h-[44px] flex-1 rounded-lg border-2 py-2.5 text-center text-xs font-bold transition-all",
                    isSelected ? colors.active : colors.inactive,
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  {CONDITION_RATING_LABELS[rating]}
                </button>
              );
            })}
          </div>
        )}

        {item.item_type === CHECKLIST_ITEM_TYPE.CHECKBOX && (
          <div className="flex items-center gap-3 py-1">
            <Switch
              checked={local.value === "true"}
              onCheckedChange={handleCheckboxChange}
              disabled={disabled}
              className="data-[state=checked]:bg-emerald-600"
            />
            <Label className="text-sm font-medium text-slate-600">
              {local.value === "true" ? "Yes" : "No"}
            </Label>
          </div>
        )}

        {item.item_type === CHECKLIST_ITEM_TYPE.TEXT && (
          <Textarea
            value={local.value ?? ""}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Enter details..."
            disabled={disabled}
            rows={3}
            className="min-h-[88px] rounded-lg border-slate-300 text-base"
          />
        )}

        {item.item_type === CHECKLIST_ITEM_TYPE.NUMBER && (
          <Input
            type="number"
            value={local.value ?? ""}
            onChange={(e) => handleNumberChange(e.target.value)}
            placeholder="Enter value..."
            disabled={disabled}
            className="h-12 rounded-lg border-slate-300 text-base"
          />
        )}

        {needsPhoto && (
          <ChecklistPhotoInput
            photoIds={local.photo_ids}
            photoMetadata={local.photo_metadata}
            onPhotosChange={handlePhotosChange}
            maxPhotos={5}
            disabled={disabled}
          />
        )}

        {item.item_type !== CHECKLIST_ITEM_TYPE.TEXT && (
          <div>
            <button
              type="button"
              onClick={() => setShowNotes(!showNotes)}
              className="flex min-h-[44px] items-center gap-1 text-sm font-medium text-slate-400 hover:text-slate-600"
            >
              {showNotes ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
              {showNotes ? "Hide notes" : "Add notes"}
            </button>
            {showNotes && (
              <Textarea
                value={local.notes ?? ""}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Additional notes..."
                disabled={disabled}
                rows={2}
                className="mt-1 rounded-lg border-slate-300 text-sm"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
