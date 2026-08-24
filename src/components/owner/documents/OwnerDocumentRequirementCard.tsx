"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { FileUp, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "../../../../convex/_generated/dataModel";
import { DOCUMENT_ITEM_STATUS, DOCUMENT_ITEM_STATUS_LABELS } from "../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "../../../../convex/_generated/api";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

type OwnerDocumentItem = {
  item_id: string;
  label: string;
  is_required: boolean;
  status: string;
  file_type: string | null;
  file_size: number | null;
  collected_at: number | null;
  rejection_notes: string | null;
};

type OwnerDocumentRequirement = {
  _id: Id<"document_requirements">;
  requirement_type: string;
  overall_status: string;
  context: {
    lead_id: Id<"leads"> | null;
    listing_id: Id<"listings"> | null;
    closure_id: Id<"closures"> | null;
    property_label: string;
  };
  items: OwnerDocumentItem[];
};

type OwnerDocumentRequirementCardProps = {
  requirement: OwnerDocumentRequirement;
};

function statusColor(status: string): string {
  if (status === DOCUMENT_ITEM_STATUS.PENDING) return "bg-slate-100 text-slate-600";
  if (status === DOCUMENT_ITEM_STATUS.COLLECTED) return "bg-blue-100 text-blue-700";
  if (status === DOCUMENT_ITEM_STATUS.VERIFIED) return "bg-emerald-100 text-emerald-700";
  if (status === DOCUMENT_ITEM_STATUS.REJECTED) return "bg-red-100 text-red-700";
  if (status === DOCUMENT_ITEM_STATUS.NA) return "bg-slate-50 text-slate-400";
  return "bg-slate-100 text-slate-600";
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) {
    return "-";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function canUpload(status: string): boolean {
  return status === DOCUMENT_ITEM_STATUS.PENDING || status === DOCUMENT_ITEM_STATUS.REJECTED;
}

export function OwnerDocumentRequirementCard({ requirement }: OwnerDocumentRequirementCardProps) {
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrlForOwner);
  const collectItemForOwner = useMutation(api.documents.collectItemForOwner);

  async function handleUpload(item: OwnerDocumentItem, file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Only JPEG, PNG, and PDF files are accepted");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum 10MB");
      return;
    }

    setUploadingItemId(item.item_id);

    try {
      const uploadUrl = await generateUploadUrl({
        requirement_id: requirement._id,
        item_id: item.item_id,
      });

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const { storageId } = (await response.json()) as {
        storageId: Id<"_storage">;
      };

      await collectItemForOwner({
        requirement_id: requirement._id,
        item_id: item.item_id,
        storage_id: storageId,
        file_type: file.type,
        file_size: file.size,
      });

      toast.success(`Uploaded ${item.label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed. Try again.");
    } finally {
      setUploadingItemId(null);
    }
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-slate-900">
          {requirement.context.property_label}
        </CardTitle>
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {requirement.requirement_type.replaceAll("_", " ")} ·{" "}
          {requirement.overall_status.replaceAll("_", " ")}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {requirement.items.map((item) => {
          const inputId = `owner-doc-${requirement._id}-${item.item_id}`;
          const isUploading = uploadingItemId === item.item_id;

          return (
            <div key={item.item_id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{item.label}</p>
                  <p className="text-xs text-slate-500">
                    {item.is_required ? "Required" : "Optional"} · File{" "}
                    {formatFileSize(item.file_size)}
                  </p>
                </div>
                <Badge className={`text-[10px] font-semibold ${statusColor(item.status)}`}>
                  {DOCUMENT_ITEM_STATUS_LABELS[
                    item.status as keyof typeof DOCUMENT_ITEM_STATUS_LABELS
                  ] ?? item.status}
                </Badge>
              </div>

              {item.rejection_notes ? (
                <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
                  Rejection note: {item.rejection_notes}
                </p>
              ) : null}

              {canUpload(item.status) ? (
                <div className="mt-2">
                  <input
                    id={inputId}
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleUpload(item, file);
                      }
                      event.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 w-full gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
                    disabled={isUploading}
                    onClick={() => {
                      const element = document.getElementById(inputId) as HTMLInputElement | null;
                      element?.click();
                    }}
                  >
                    {isUploading ? <Loader2 className="size-4 animate-spin" /> : null}
                    {item.status === DOCUMENT_ITEM_STATUS.REJECTED ? (
                      <RotateCcw className="size-4" />
                    ) : (
                      <FileUp className="size-4" />
                    )}
                    {item.status === DOCUMENT_ITEM_STATUS.REJECTED ? "Re-upload" : "Upload"}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
