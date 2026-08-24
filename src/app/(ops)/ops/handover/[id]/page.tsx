"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { HandoverChecklistForm } from "../components/handover-checklist-form";

export default function OpsHandoverChecklistPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params.id;
  const checklistId =
    typeof idParam === "string" ? (idParam as Id<"checklist_instances">) : undefined;

  const checklist = useQuery(
    api.checklists.getById,
    checklistId ? { checklist_id: checklistId } : "skip",
  );
  const template = useQuery(
    api.checklistTemplates.getById,
    checklist ? { id: checklist.template_id } : "skip",
  );

  if (!checklistId) {
    return (
      <div className="space-y-4">
        <Link
          href="/ops/dashboard"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Invalid handover checklist id.
        </div>
      </div>
    );
  }

  if (checklist === undefined || (checklist && template === undefined)) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-7 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!checklist || !template) {
    return (
      <div className="space-y-4">
        <Link
          href="/ops/dashboard"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Handover checklist not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-base">
      <div className="flex items-center justify-between">
        <Link
          href="/ops/dashboard"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Link>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h1 className="text-lg font-bold text-emerald-900">Move-in Handover Checklist</h1>
        <p className="mt-1 text-sm text-emerald-800">
          Complete all required checkpoints before final move-in confirmation.
        </p>
      </div>

      <HandoverChecklistForm
        checklistId={checklist._id}
        instance={checklist}
        template={template}
        onSubmitted={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
