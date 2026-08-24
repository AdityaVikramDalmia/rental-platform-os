"use client";

import imageCompression from "browser-image-compression";
import { useMutation } from "convex/react";
import { ImagePlus, Loader2, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTOS = 10;

type UploadingFile = {
  id: string;
  name: string;
  preview: string;
  status: "compressing" | "uploading" | "saving" | "done" | "error";
  error?: string;
};

type PhotoUploaderProps = {
  listingId: Id<"listings">;
  currentPhotoCount?: number;
  onPhotoCountChange?: (count: number) => void;
};

export function PhotoUploader({
  listingId,
  currentPhotoCount = 0,
  onPhotoCountChange,
}: PhotoUploaderProps) {
  const generateUploadUrl = useMutation(api.listings.generateUploadUrl);
  const addPhoto = useMutation(api.listings.addPhoto);

  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUploading = uploadingFiles.some(
    (f) => f.status === "compressing" || f.status === "uploading" || f.status === "saving",
  );

  const processFiles = useCallback(
    async (files: File[]) => {
      const validFiles = files.filter((f) => {
        if (!ACCEPTED_TYPES.has(f.type)) {
          toast.error(`${f.name}: Only JPEG, PNG, and WebP images are accepted.`);
          return false;
        }
        return true;
      });

      const remaining =
        MAX_PHOTOS - currentPhotoCount - uploadingFiles.filter((f) => f.status !== "error").length;
      if (validFiles.length > remaining) {
        toast.error(
          `Maximum ${MAX_PHOTOS} photos allowed. You can add ${Math.max(0, remaining)} more.`,
        );
        return;
      }

      for (const file of validFiles) {
        const fileId = `${Date.now()}-${file.name}`;
        const preview = URL.createObjectURL(file);

        setUploadingFiles((prev) => [
          ...prev,
          { id: fileId, name: file.name, preview, status: "compressing" },
        ]);

        try {
          const compressed = await imageCompression(file, {
            maxSizeMB: 1,
            maxWidthOrHeight: 2048,
          });

          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === fileId ? { ...f, status: "uploading" } : f)),
          );

          const uploadUrl = await generateUploadUrl({});
          const result = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": compressed.type || file.type },
            body: compressed,
          });

          if (!result.ok) {
            throw new Error("Upload failed");
          }

          const { storageId } = (await result.json()) as { storageId: Id<"_storage"> };

          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === fileId ? { ...f, status: "saving" } : f)),
          );

          await addPhoto({
            listing_id: listingId,
            storage_id: storageId,
            display_order: currentPhotoCount + validFiles.indexOf(file),
          });

          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === fileId ? { ...f, status: "done" } : f)),
          );

          onPhotoCountChange?.(currentPhotoCount + 1);

          setTimeout(() => {
            setUploadingFiles((prev) => prev.filter((f) => f.id !== fileId));
            URL.revokeObjectURL(preview);
          }, 1500);
        } catch (error) {
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === fileId
                ? {
                    ...f,
                    status: "error",
                    error: error instanceof Error ? error.message : "Upload failed",
                  }
                : f,
            ),
          );
          toast.error(`Failed to upload ${file.name}`);
        }
      }
    },
    [listingId, currentPhotoCount, uploadingFiles, generateUploadUrl, addPhoto, onPhotoCountChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
      const files = Array.from(e.dataTransfer.files);
      processFiles(files);
    },
    [processFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      processFiles(files);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [processFiles],
  );

  const removeFailedUpload = useCallback((fileId: string) => {
    setUploadingFiles((prev) => {
      const file = prev.find((f) => f.id === fileId);
      if (file) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== fileId);
    });
  }, []);

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors",
          isDragActive
            ? "border-slate-400 bg-slate-50"
            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
          isUploading && "cursor-not-allowed opacity-50",
        )}
      >
        <Upload className="mb-2 size-8 text-slate-400" />
        <p className="text-sm font-medium text-slate-700">
          {isDragActive ? "Drop images here" : "Drag & drop or click to upload"}
        </p>
        <p className="mt-1 text-xs text-slate-500">JPEG, PNG, WebP — max 10 photos</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {uploadingFiles.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {uploadingFiles.map((file) => (
            <div
              key={file.id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200"
            >
              <img src={file.preview} alt={file.name} className="h-full w-full object-cover" />
              <div
                className={cn(
                  "absolute inset-0 flex items-center justify-center",
                  file.status === "done"
                    ? "bg-green-500/20"
                    : file.status === "error"
                      ? "bg-red-500/20"
                      : "bg-black/40",
                )}
              >
                {file.status === "compressing" && (
                  <div className="flex flex-col items-center text-white">
                    <Loader2 className="size-5 animate-spin" />
                    <span className="mt-1 text-[10px]">Compressing</span>
                  </div>
                )}
                {file.status === "uploading" && (
                  <div className="flex flex-col items-center text-white">
                    <Loader2 className="size-5 animate-spin" />
                    <span className="mt-1 text-[10px]">Uploading</span>
                  </div>
                )}
                {file.status === "saving" && (
                  <div className="flex flex-col items-center text-white">
                    <Loader2 className="size-5 animate-spin" />
                    <span className="mt-1 text-[10px]">Saving</span>
                  </div>
                )}
                {file.status === "done" && <ImagePlus className="size-5 text-green-700" />}
                {file.status === "error" && (
                  <button
                    type="button"
                    onClick={() => removeFailedUpload(file.id)}
                    className="rounded-full bg-red-500 p-1 text-white"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
