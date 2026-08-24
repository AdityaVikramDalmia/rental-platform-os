"use client";

import { useState } from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import type { Doc } from "../../../../../../convex/_generated/dataModel";
import {
  DOCUMENT_ITEM_STATUS,
  DOCUMENT_OVERALL_STATUS_LABELS,
  DOCUMENT_REQUIREMENT_TYPE_LABELS,
  type DocumentOverallStatus,
  type DocumentRequirementType,
} from "../../../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DocumentUploadSheet } from "./document-upload-sheet";

type Requirement = Doc<"document_requirements">;

type DocumentRequirementsListProps = {
  requirements: Requirement[];
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

function requirementTypeColor(type: DocumentRequirementType) {
  switch (type) {
    case "OWNER_DOCS":
      return "bg-violet-100 text-violet-700";
    case "TENANT_DOCS":
      return "bg-blue-100 text-blue-700";
    case "SOCIETY_DOCS":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function itemProgress(items: Requirement["items"]) {
  const actionable = items.filter((i) => i.status !== DOCUMENT_ITEM_STATUS.NA);
  const done = actionable.filter((i) => i.status === DOCUMENT_ITEM_STATUS.VERIFIED);
  const rejected = actionable.filter((i) => i.status === DOCUMENT_ITEM_STATUS.REJECTED);
  return {
    done: done.length,
    rejected: rejected.length,
    total: actionable.length,
    percent: actionable.length > 0 ? (done.length / actionable.length) * 100 : 0,
  };
}

function entityLabel(req: Requirement): string {
  if (req.closure_id) return `Closure · ${req.closure_id.slice(-6)}`;
  if (req.listing_id) return `Listing · ${req.listing_id.slice(-6)}`;
  if (req.lead_id) return `Lead · ${req.lead_id.slice(-6)}`;
  return "Unlinked";
}

export function DocumentRequirementsList({ requirements }: DocumentRequirementsListProps) {
  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null);

  if (requirements.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
        <FolderOpen className="mx-auto mb-2 size-9 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">No document requirements</p>
        <p className="mt-1 text-xs text-slate-500">
          Requirements assigned to you will appear here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2.5">
        {requirements.map((req) => {
          const progress = itemProgress(req.items);
          return (
            <Card
              key={req._id}
              className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <CardContent className="p-0">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 p-3 text-left"
                  onClick={() => setSelectedRequirement(req)}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] font-semibold ${requirementTypeColor(req.requirement_type)}`}
                      >
                        {DOCUMENT_REQUIREMENT_TYPE_LABELS[req.requirement_type]}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] font-semibold ${overallStatusColor(req.overall_status)}`}
                      >
                        {DOCUMENT_OVERALL_STATUS_LABELS[req.overall_status]}
                      </Badge>
                    </div>

                    <p className="text-xs text-slate-500">{entityLabel(req)}</p>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">
                          {progress.done} of {progress.total} verified
                        </span>
                        {progress.rejected > 0 ? (
                          <span className="font-medium text-red-600">
                            {progress.rejected} rejected
                          </span>
                        ) : null}
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="size-4 shrink-0 text-slate-400" />
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DocumentUploadSheet
        requirement={selectedRequirement}
        open={selectedRequirement !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequirement(null);
          }
        }}
      />
    </>
  );
}
