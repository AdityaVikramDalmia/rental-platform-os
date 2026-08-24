"use client";

import type { Doc } from "../../../../../../convex/_generated/dataModel";
import {
  DOCUMENT_ITEM_STATUS,
  DOCUMENT_OVERALL_STATUS_LABELS,
  DOCUMENT_REQUIREMENT_TYPE_LABELS,
  type DocumentOverallStatus,
} from "../../../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DocumentItemActions } from "./document-item-actions";

type Requirement = Doc<"document_requirements">;

type DocumentUploadSheetProps = {
  requirement: Requirement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function overallStatusColor(status: DocumentOverallStatus) {
  switch (status) {
    case "NOT_STARTED":
      return "bg-slate-100 text-slate-600";
    case "IN_PROGRESS":
      return "bg-blue-100 text-blue-700";
    case "COMPLETE":
      return "bg-emerald-100 text-emerald-700";
    case "BLOCKED":
      return "bg-red-100 text-red-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function itemProgress(items: Requirement["items"]) {
  const actionable = items.filter((i) => i.status !== DOCUMENT_ITEM_STATUS.NA);
  const complete = actionable.filter((i) => i.status === DOCUMENT_ITEM_STATUS.VERIFIED);
  return { done: complete.length, total: actionable.length };
}

export function DocumentUploadSheet({ requirement, open, onOpenChange }: DocumentUploadSheetProps) {
  if (!requirement) {
    return null;
  }

  const progress = itemProgress(requirement.items);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">
            {DOCUMENT_REQUIREMENT_TYPE_LABELS[requirement.requirement_type]}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2 text-xs">
            <Badge
              variant="secondary"
              className={`text-[10px] font-semibold ${overallStatusColor(requirement.overall_status)}`}
            >
              {DOCUMENT_OVERALL_STATUS_LABELS[requirement.overall_status]}
            </Badge>
            <span className="text-slate-500">
              {progress.done} of {progress.total} verified
            </span>
          </SheetDescription>
        </SheetHeader>

        <Separator />

        <div className="space-y-4 px-4 pb-8 pt-4">
          {requirement.items.map((item) => (
            <div key={item.item_id} className="space-y-2">
              <DocumentItemActions requirementId={requirement._id} item={item} />
              {item !== requirement.items[requirement.items.length - 1] ? (
                <Separator className="mt-3" />
              ) : null}
            </div>
          ))}

          {requirement.notes ? (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Requirement notes
              </p>
              <p className="mt-0.5 text-xs text-slate-700">{requirement.notes}</p>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
