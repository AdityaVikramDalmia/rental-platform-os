"use client";

import { useMutation, useQuery } from "convex/react";
import { ExternalLink, Loader2, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  NEGOTIATION_CHECKLIST_ITEM_STATUS,
  NEGOTIATION_CHECKLIST_ITEM_STATUS_COLORS,
  NEGOTIATION_CHECKLIST_ITEM_STATUS_LABELS,
} from "../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface RentAgreementUploadProps {
  negotiationId: Id<"negotiations">;
  currentFileId?: Id<"_storage">;
  onUploadSuccess?: () => void;
  canManage?: boolean;
}

const ACCEPTED_FILE_TYPES = "application/pdf,image/jpeg,image/png,image/webp";
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

export function RentAgreementUpload({
  negotiationId,
  currentFileId,
  onUploadSuccess,
  canManage = true,
}: RentAgreementUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [lastUploadedFileName, setLastUploadedFileName] = useState<string | null>(null);

  const checklistStatus = useQuery(api.negotiationChecklist.getChecklistStatus, {
    negotiation_id: negotiationId,
  });
  const rentAgreementFile = useQuery(api.negotiations.getRentAgreementFile, {
    negotiation_id: negotiationId,
  });

  const generateUploadUrl = useMutation(api.negotiations.generateUploadUrl);
  const updateChecklistItem = useMutation(api.negotiationChecklist.updateChecklistItem);

  const currentStatus = checklistStatus?.manual_items.rent_agreement_status.status;
  const isWaived = currentStatus === NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED;
  const isReadOnly = !canManage;

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    if (!canManage) {
      toast.error("You do not have permission to upload rent agreement files");
      event.target.value = "";
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File is too large. Maximum size is 15MB.");
      event.target.value = "";
      return;
    }

    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      toast.error("Only PDF or image files are allowed.");
      event.target.value = "";
      return;
    }

    if (!currentStatus) {
      toast.error("Checklist state is still loading. Try again.");
      event.target.value = "";
      return;
    }

    if (isWaived) {
      toast.error("Rent agreement is waived. Unwaive before uploading.");
      event.target.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      const nextStatus =
        currentStatus === NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING
          ? NEGOTIATION_CHECKLIST_ITEM_STATUS.DRAFT_READY
          : currentStatus;

      await updateChecklistItem({
        negotiation_id: negotiationId,
        item_key: "rent_agreement_status",
        status: nextStatus,
        file_id: storageId,
      });

      setLastUploadedFileName(file.name);
      toast.success("Rent agreement uploaded");
      onUploadSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload rent agreement");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  return (
    <Card className="border-slate-200 py-0">
      <CardContent className="space-y-3 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-700">Rent Agreement File</p>
          {currentStatus ? (
            <Badge
              variant="secondary"
              className={cn(
                "text-[11px] font-semibold",
                NEGOTIATION_CHECKLIST_ITEM_STATUS_COLORS[currentStatus],
              )}
            >
              {NEGOTIATION_CHECKLIST_ITEM_STATUS_LABELS[currentStatus]}
            </Badge>
          ) : null}
        </div>

        {currentFileId ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700">
            <p className="font-medium text-slate-900">
              {lastUploadedFileName ?? "Previously uploaded file"}
            </p>
            <p className="mt-1 break-all text-[11px] text-slate-500">Storage ID: {currentFileId}</p>
            {rentAgreementFile?.url ? (
              <a
                href={rentAgreementFile.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
              >
                Open file
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No file uploaded yet.</p>
        )}

        <Input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleUpload}
          disabled={isUploading || isWaived || isReadOnly}
          className="text-xs"
        />

        {isReadOnly ? (
          <p className="text-xs text-slate-500">
            View-only access. Upload is available to users with manage permission.
          </p>
        ) : null}

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isUploading || isWaived || isReadOnly}
          onClick={() => fileInputRef.current?.click()}
          className="h-8 gap-1.5"
        >
          {isUploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          {isUploading ? "Uploading..." : "Choose File"}
        </Button>
      </CardContent>
    </Card>
  );
}

export type { RentAgreementUploadProps };
