"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { CheckCircle2, FileUp, Loader2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../../convex/_generated/dataModel";
import { DOCUMENT_ITEM_STATUS, DOCUMENT_ITEM_STATUS_LABELS } from "../../../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

type RequirementItem = Doc<"document_requirements">["items"][number];

type DocumentItemActionsProps = {
  requirementId: Id<"document_requirements">;
  item: RequirementItem;
  onUploaded?: () => void;
};

function statusBadgeVariant(status: RequirementItem["status"]) {
  switch (status) {
    case DOCUMENT_ITEM_STATUS.PENDING:
      return "bg-slate-100 text-slate-600";
    case DOCUMENT_ITEM_STATUS.COLLECTED:
      return "bg-blue-100 text-blue-700";
    case DOCUMENT_ITEM_STATUS.VERIFIED:
      return "bg-emerald-100 text-emerald-700";
    case DOCUMENT_ITEM_STATUS.REJECTED:
      return "bg-red-100 text-red-700";
    case DOCUMENT_ITEM_STATUS.NA:
      return "bg-slate-50 text-slate-400";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function DocumentItemActions({ requirementId, item, onUploaded }: DocumentItemActionsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const collectItem = useMutation(api.documents.collectItem);
  const verifyItem = useMutation(api.documents.verifyItem);
  const rejectItem = useMutation(api.documents.rejectItem);

  async function handleUpload(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Only JPEG, PNG, and PDF files are accepted");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum 10MB");
      return;
    }

    setUploading(true);

    try {
      const uploadUrl = await generateUploadUrl({
        requirement_id: requirementId,
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

      await collectItem({
        requirement_id: requirementId,
        item_id: item.item_id,
        storage_id: storageId,
        file_type: file.type,
        file_size: file.size,
      });

      toast.success(`"${item.label}" uploaded`);
      onUploaded?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  }

  async function handleVerify() {
    setVerifying(true);

    try {
      await verifyItem({
        requirement_id: requirementId,
        item_id: item.item_id,
      });
      toast.success(`"${item.label}" verified`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function handleReject() {
    const notes = rejectionNotes.trim();

    if (!notes) {
      toast.error("Rejection reason is required");
      return;
    }

    setRejecting(true);

    try {
      await rejectItem({
        requirement_id: requirementId,
        item_id: item.item_id,
        rejection_notes: notes,
      });
      toast.success(`"${item.label}" rejected`);
      setShowReject(false);
      setRejectionNotes("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rejection failed");
    } finally {
      setRejecting(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{item.label}</p>
          {item.description ? <p className="text-xs text-slate-500">{item.description}</p> : null}
        </div>
        <Badge
          variant="secondary"
          className={`shrink-0 text-[10px] font-semibold ${statusBadgeVariant(item.status)}`}
        >
          {DOCUMENT_ITEM_STATUS_LABELS[item.status]}
        </Badge>
      </div>

      {item.status === DOCUMENT_ITEM_STATUS.PENDING ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleUpload(file);
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            className="h-10 w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileUp className="size-4" />
            )}
            {uploading ? "Uploading…" : "Upload Document"}
          </Button>
        </>
      ) : null}

      {item.status === DOCUMENT_ITEM_STATUS.COLLECTED ? (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="h-10 flex-1 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={verifying || rejecting}
            onClick={() => void handleVerify()}
          >
            {verifying ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            Verify
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10 flex-1 gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            disabled={verifying || rejecting}
            onClick={() => setShowReject(true)}
          >
            <XCircle className="size-3.5" />
            Reject
          </Button>
        </div>
      ) : null}

      {item.status === DOCUMENT_ITEM_STATUS.VERIFIED ? (
        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="size-3.5" />
          Document verified
        </div>
      ) : null}

      {item.status === DOCUMENT_ITEM_STATUS.REJECTED ? (
        <div className="space-y-2">
          {item.rejection_notes ? (
            <div className="rounded-lg bg-red-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-red-500">
                Rejection reason
              </p>
              <p className="mt-0.5 text-xs text-red-700">{item.rejection_notes}</p>
            </div>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleUpload(file);
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            className="h-10 w-full gap-2 bg-amber-600 text-white hover:bg-amber-700"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            {uploading ? "Uploading…" : "Re-upload"}
          </Button>
        </div>
      ) : null}

      {item.status === DOCUMENT_ITEM_STATUS.NA ? (
        <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
          Not applicable
        </div>
      ) : null}

      {showReject && item.status === DOCUMENT_ITEM_STATUS.COLLECTED ? (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
          <Textarea
            placeholder="Reason for rejection (required)…"
            value={rejectionNotes}
            onChange={(e) => setRejectionNotes(e.target.value)}
            className="min-h-[72px] border-red-200 bg-white text-sm"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-9 flex-1 bg-red-600 text-white hover:bg-red-700"
              disabled={rejecting || !rejectionNotes.trim()}
              onClick={() => void handleReject()}
            >
              {rejecting ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Confirm Reject
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-9"
              onClick={() => {
                setShowReject(false);
                setRejectionNotes("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
