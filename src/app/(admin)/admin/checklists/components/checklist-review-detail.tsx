"use client";

import { useQuery } from "convex/react";
import { CheckCircle2, CircleOff, ImageIcon } from "lucide-react";
import { useMemo } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  CHECKLIST_ITEM_TYPE,
  CHECKLIST_STATUS,
  CHECKLIST_STATUS_LABELS,
  CONDITION_RATING,
  CONDITION_RATING_LABELS,
  type ChecklistDepth,
  type ChecklistItemType,
  type ChecklistStatus,
  type ConditionRating,
} from "../../../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const ITEM_TYPE_LABELS: Record<ChecklistItemType, string> = {
  [CHECKLIST_ITEM_TYPE.CONDITION]: "Condition",
  [CHECKLIST_ITEM_TYPE.CHECKBOX]: "Checkbox",
  [CHECKLIST_ITEM_TYPE.TEXT]: "Text",
  [CHECKLIST_ITEM_TYPE.NUMBER]: "Number",
  [CHECKLIST_ITEM_TYPE.PHOTO]: "Photo",
  [CHECKLIST_ITEM_TYPE.PHOTO_CONDITION]: "Photo + Condition",
};

const STATUS_BADGE_STYLES: Record<ChecklistStatus, string> = {
  [CHECKLIST_STATUS.ASSIGNED]: "border-slate-200 bg-slate-100 text-slate-700",
  [CHECKLIST_STATUS.IN_PROGRESS]: "border-indigo-200 bg-indigo-100 text-indigo-700",
  [CHECKLIST_STATUS.SUBMITTED]: "border-blue-200 bg-blue-100 text-blue-700",
  [CHECKLIST_STATUS.UNDER_REVIEW]: "border-amber-200 bg-amber-100 text-amber-700",
  [CHECKLIST_STATUS.REVISION_REQUESTED]: "border-orange-200 bg-orange-100 text-orange-700",
  [CHECKLIST_STATUS.APPROVED]: "border-emerald-200 bg-emerald-100 text-emerald-700",
  [CHECKLIST_STATUS.REJECTED]: "border-red-200 bg-red-100 text-red-700",
};

const CONDITION_BADGE_STYLES: Record<ConditionRating, string> = {
  [CONDITION_RATING.EXCELLENT]: "border-emerald-200 bg-emerald-100 text-emerald-700",
  [CONDITION_RATING.GOOD]: "border-green-200 bg-green-100 text-green-700",
  [CONDITION_RATING.FAIR]: "border-amber-200 bg-amber-100 text-amber-700",
  [CONDITION_RATING.POOR]: "border-red-200 bg-red-100 text-red-700",
  [CONDITION_RATING.NA]: "border-slate-200 bg-slate-100 text-slate-600",
};

type ChecklistResponseEntry = {
  item_id: string;
  section_id: string;
  value?: string;
  condition_rating?: ConditionRating;
  photo_ids: Id<"_storage">[];
  notes?: string;
  completed_at?: number;
};

type ChecklistTemplateItem = {
  item_id: string;
  label: string;
  item_type: ChecklistItemType;
  is_required: boolean;
  requires_photo: boolean;
  min_depth: ChecklistDepth;
};

type ChecklistTemplateSection = {
  section_id: string;
  title: string;
  description?: string;
  items: ChecklistTemplateItem[];
};

type ChecklistReviewDetailProps = {
  checklistId: Id<"checklist_instances">;
};

function formatDateTime(timestampMs: number | undefined): string {
  if (!timestampMs) {
    return "-";
  }

  return DATE_FORMATTER.format(timestampMs);
}

export function ChecklistReviewDetail({ checklistId }: ChecklistReviewDetailProps) {
  const checklist = useQuery(api.checklists.getById, {
    checklist_id: checklistId,
  });
  const template = useQuery(
    api.checklistTemplates.getById,
    checklist
      ? {
          id: checklist.template_id,
        }
      : "skip",
  );
  const photoUrls = useQuery(api.checklists.getPhotoUrls, {
    checklist_id: checklistId,
  });
  const reviewer = useQuery(
    api.users.getById,
    checklist?.reviewed_by
      ? {
          id: checklist.reviewed_by,
        }
      : "skip",
  );

  const responseByItem = useMemo(() => {
    const lookup = new Map<string, ChecklistResponseEntry>();

    if (!checklist) {
      return lookup;
    }

    for (const response of checklist.responses) {
      lookup.set(`${response.section_id}:${response.item_id}`, response);
    }

    return lookup;
  }, [checklist]);

  const photoUrlMap = useMemo(() => {
    const lookup = new Map<string, string | null>();

    for (const photo of photoUrls ?? []) {
      lookup.set(String(photo.storage_id), photo.url ?? null);
    }

    return lookup;
  }, [photoUrls]);

  if (checklist === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const renderResponse = (
    item: ChecklistTemplateItem,
    response: ChecklistResponseEntry | undefined,
  ) => {
    if (
      item.item_type === CHECKLIST_ITEM_TYPE.CONDITION ||
      item.item_type === CHECKLIST_ITEM_TYPE.PHOTO_CONDITION
    ) {
      const rating = response?.condition_rating;

      return (
        <div className="space-y-2">
          {rating ? (
            <Badge className={CONDITION_BADGE_STYLES[rating]}>
              {CONDITION_RATING_LABELS[rating]}
            </Badge>
          ) : (
            <p className="text-sm text-slate-500">No condition rating submitted.</p>
          )}

          {item.item_type === CHECKLIST_ITEM_TYPE.PHOTO_CONDITION ? (
            response?.photo_ids.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {response.photo_ids.map((photoId) => {
                  const photoUrl = photoUrlMap.get(String(photoId));

                  return (
                    <a
                      key={photoId}
                      href={photoUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        "relative block overflow-hidden rounded-md border border-slate-200 bg-slate-50",
                        !photoUrl && "pointer-events-none",
                      )}
                    >
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={`Checklist evidence ${item.label}`}
                          className="h-24 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-24 items-center justify-center text-xs text-slate-400">
                          Unavailable
                        </div>
                      )}
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No photo evidence submitted.</p>
            )
          ) : null}
        </div>
      );
    }

    if (item.item_type === CHECKLIST_ITEM_TYPE.CHECKBOX) {
      if (response?.value !== "true" && response?.value !== "false") {
        return <p className="text-sm text-slate-500">No checkbox response submitted.</p>;
      }

      const isChecked = response.value === "true";

      return (
        <div className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
          {isChecked ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <CircleOff className="size-4 text-slate-400" />
          )}
          {isChecked ? "Checked" : "Unchecked"}
        </div>
      );
    }

    if (
      item.item_type === CHECKLIST_ITEM_TYPE.TEXT ||
      item.item_type === CHECKLIST_ITEM_TYPE.NUMBER
    ) {
      if (!response?.value?.trim()) {
        return <p className="text-sm text-slate-500">No value submitted.</p>;
      }

      return <p className="text-sm text-slate-800">{response.value}</p>;
    }

    if (item.item_type === CHECKLIST_ITEM_TYPE.PHOTO) {
      if (!response?.photo_ids.length) {
        return <p className="text-sm text-slate-500">No photo evidence submitted.</p>;
      }

      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {response.photo_ids.map((photoId) => {
            const photoUrl = photoUrlMap.get(String(photoId));

            return (
              <a
                key={photoId}
                href={photoUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "relative block overflow-hidden rounded-md border border-slate-200 bg-slate-50",
                  !photoUrl && "pointer-events-none",
                )}
              >
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={`Checklist photo evidence ${item.label}`}
                    className="h-24 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-24 items-center justify-center text-xs text-slate-400">
                    Unavailable
                  </div>
                )}
              </a>
            );
          })}
        </div>
      );
    }

    return <p className="text-sm text-slate-500">No response submitted.</p>;
  };

  const templateSections = (template?.sections ?? []) as ChecklistTemplateSection[];

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className={STATUS_BADGE_STYLES[checklist.status]}>
                {CHECKLIST_STATUS_LABELS[checklist.status]}
              </Badge>
              <span className="text-sm text-slate-500">
                Submitted {formatDateTime(checklist.submitted_at ?? checklist._creationTime)}
              </span>
            </div>

            <p className="text-sm text-slate-600">
              Template: {template?.name ?? "Loading template..."} • Responses:{" "}
              {checklist.responses.length}
            </p>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Completeness Score
            </p>
            <p className="text-3xl font-semibold text-blue-900">{checklist.completeness_score}%</p>
          </div>
        </CardContent>
      </Card>

      {template === undefined ? <Skeleton className="h-44 w-full" /> : null}

      {template !== undefined && templateSections.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="flex items-center gap-2 py-8 text-sm text-slate-500">
            <ImageIcon className="size-4" />
            Checklist template data is unavailable for this depth.
          </CardContent>
        </Card>
      ) : null}

      {templateSections.map((section) => (
        <Card key={section.section_id} className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-900">
              {section.title}
            </CardTitle>
            {section.description ? (
              <p className="text-sm text-slate-500">{section.description}</p>
            ) : null}
          </CardHeader>

          <CardContent className="space-y-3 pt-2">
            {section.items.map((item) => {
              const response = responseByItem.get(`${section.section_id}:${item.item_id}`);

              return (
                <div
                  key={`${section.section_id}:${item.item_id}`}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                      <p className="text-xs text-slate-500">{ITEM_TYPE_LABELS[item.item_type]}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.is_required ? (
                        <Badge className="border-red-200 bg-red-50 text-red-700">Required</Badge>
                      ) : (
                        <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                          Optional
                        </Badge>
                      )}
                      {item.requires_photo ? (
                        <Badge className="border-amber-200 bg-amber-100 text-amber-700">
                          Photo Required
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3">{renderResponse(item, response)}</div>

                  {response?.notes ? (
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">Notes:</span> {response.notes}
                    </p>
                  ) : null}

                  {response?.completed_at ? (
                    <p className="mt-2 text-xs text-slate-400">
                      Updated {formatDateTime(response.completed_at)}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">Review History</CardTitle>
        </CardHeader>
        <CardContent>
          {checklist.reviewed_at || checklist.review_notes ? (
            <div className="space-y-2 text-sm">
              <p className="text-slate-700">
                <span className="font-medium text-slate-900">Reviewed By:</span>{" "}
                {reviewer === undefined
                  ? "Loading..."
                  : (reviewer?.name ??
                    (checklist.reviewed_by ? checklist.reviewed_by.slice(0, 8) : "-"))}
              </p>
              <p className="text-slate-700">
                <span className="font-medium text-slate-900">Reviewed At:</span>{" "}
                {formatDateTime(checklist.reviewed_at)}
              </p>
              <p className="text-slate-700">
                <span className="font-medium text-slate-900">Review Notes:</span>{" "}
                {checklist.review_notes ?? "-"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No review actions have been recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
