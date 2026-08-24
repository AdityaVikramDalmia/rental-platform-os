"use client";

import { useMutation } from "convex/react";
import { FileIcon, ImageIcon, Loader2, Trash2, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png";

type UploadingFile = {
  id: string;
  file: File;
  status: "uploading" | "done" | "error";
  storageId?: Id<"_storage">;
  previewUrl?: string;
  name: string;
};

type SingleModeProps = {
  mode: "single";
  value: Id<"_storage"> | null;
  onChange: (value: Id<"_storage"> | null) => void;
};

type MultiDocument = {
  name: string;
  storage_id: Id<"_storage">;
};

type MultiModeProps = {
  mode: "multi";
  value: MultiDocument[];
  onChange: (value: MultiDocument[]) => void;
};

type DocumentUploaderProps = (SingleModeProps | MultiModeProps) & {
  label?: string;
};

export function DocumentUploader(props: DocumentUploaderProps) {
  const generateUploadUrl = useMutation(api.closures.generateUploadUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

  const isPdf = (file: File) => file.type === "application/pdf";

  const validateFile = useCallback((file: File): boolean => {
    if (file.name.endsWith(".webp") || file.type === "image/webp") {
      toast.error("WebP files are not accepted. Please use PDF, JPEG, or PNG.");
      return false;
    }
    if (!ACCEPTED_TYPES.has(file.type)) {
      toast.error(`Unsupported file type: ${file.type || "unknown"}. Use PDF, JPEG, or PNG.`);
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 10MB.");
      return false;
    }
    return true;
  }, []);

  const uploadFile = useCallback(
    async (file: File): Promise<Id<"_storage"> | null> => {
      try {
        const url = await generateUploadUrl();
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }
        const result = (await response.json()) as { storageId: Id<"_storage"> };
        return result.storageId;
      } catch (error) {
        toast.error(
          `Failed to upload ${file.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        return null;
      }
    },
    [generateUploadUrl],
  );

  const handleSingleUpload = useCallback(
    async (file: File) => {
      if (props.mode !== "single") return;
      if (!validateFile(file)) return;

      const tempId = crypto.randomUUID();
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;

      setUploadingFiles([{ id: tempId, file, status: "uploading", name: file.name, previewUrl }]);

      const storageId = await uploadFile(file);
      if (storageId) {
        setUploadingFiles([
          { id: tempId, file, status: "done", storageId, name: file.name, previewUrl },
        ]);
        props.onChange(storageId);
      } else {
        setUploadingFiles([{ id: tempId, file, status: "error", name: file.name, previewUrl }]);
      }
    },
    [props, validateFile, uploadFile],
  );

  const handleMultiUpload = useCallback(
    async (files: File[]) => {
      if (props.mode !== "multi") return;

      const validFiles = files.filter(validateFile);
      if (validFiles.length === 0) return;

      const newUploading = validFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "uploading" as const,
        name: file.name.replace(/\.[^.]+$/, ""),
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      }));

      setUploadingFiles((prev) => [...prev, ...newUploading]);

      const results = await Promise.all(
        newUploading.map(async (item) => {
          const storageId = await uploadFile(item.file);
          return { ...item, storageId, status: storageId ? ("done" as const) : ("error" as const) };
        }),
      );

      setUploadingFiles((prev) => {
        const updatedIds = new Set(results.map((r) => r.id));
        return [
          ...prev.filter((f) => !updatedIds.has(f.id)),
          ...results.map((r) => ({
            ...r,
            storageId: r.storageId ?? undefined,
          })),
        ];
      });

      const successful = results.filter(
        (r): r is typeof r & { storageId: Id<"_storage"> } => r.storageId !== null,
      );
      if (successful.length > 0) {
        const newDocs = successful.map((r) => ({
          name: r.name,
          storage_id: r.storageId,
        }));
        props.onChange([...props.value, ...newDocs]);
      }
    },
    [props, validateFile, uploadFile],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;

      if (props.mode === "single") {
        handleSingleUpload(fileList[0]);
      } else {
        handleMultiUpload(Array.from(fileList));
      }
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [props.mode, handleSingleUpload, handleMultiUpload],
  );

  const handleRetry = useCallback(
    async (item: UploadingFile) => {
      setUploadingFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: "uploading" as const } : f)),
      );
      const storageId = await uploadFile(item.file);
      if (storageId) {
        setUploadingFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: "done" as const, storageId } : f)),
        );
        if (props.mode === "single") {
          props.onChange(storageId);
        } else {
          props.onChange([...props.value, { name: item.name, storage_id: storageId }]);
        }
      } else {
        setUploadingFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: "error" as const } : f)),
        );
      }
    },
    [uploadFile, props],
  );

  const handleRemoveSingle = useCallback(() => {
    if (props.mode !== "single") return;
    setUploadingFiles([]);
    props.onChange(null);
  }, [props]);

  const handleRemoveMulti = useCallback(
    (storageId: Id<"_storage">) => {
      if (props.mode !== "multi") return;
      setUploadingFiles((prev) => prev.filter((f) => f.storageId !== storageId));
      props.onChange(props.value.filter((d) => d.storage_id !== storageId));
    },
    [props],
  );

  const handleNameChange = useCallback(
    (storageId: Id<"_storage">, newName: string) => {
      if (props.mode !== "multi") return;
      props.onChange(
        props.value.map((d) => (d.storage_id === storageId ? { ...d, name: newName } : d)),
      );
    },
    [props],
  );

  const singleHasValue = props.mode === "single" && props.value !== null;
  const showUploadZone = props.mode === "multi" || !singleHasValue;
  const errorFiles = uploadingFiles.filter((f) => f.status === "error");
  const activeUploads = uploadingFiles.filter((f) => f.status === "uploading");

  return (
    <div className="space-y-3">
      {props.label && <p className="text-sm font-medium text-slate-700">{props.label}</p>}

      {/* Single mode: show uploaded file */}
      {props.mode === "single" && singleHasValue && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {uploadingFiles[0]?.previewUrl ? (
            <img
              src={uploadingFiles[0].previewUrl}
              alt="Preview"
              className="size-10 rounded object-cover"
            />
          ) : (
            <FileIcon className="size-10 text-red-500" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">
              {uploadingFiles[0]?.file.name ?? "Uploaded document"}
            </p>
            <p className="text-xs text-green-600">Uploaded</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleRemoveSingle}
            className="text-slate-400 hover:text-red-600"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {/* Multi mode: show uploaded docs */}
      {props.mode === "multi" &&
        props.value.map((doc) => {
          const uploadInfo = uploadingFiles.find((f) => f.storageId === doc.storage_id);
          return (
            <div
              key={doc.storage_id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              {uploadInfo?.previewUrl ? (
                <img
                  src={uploadInfo.previewUrl}
                  alt="Preview"
                  className="size-10 rounded object-cover"
                />
              ) : uploadInfo?.file && isPdf(uploadInfo.file) ? (
                <FileIcon className="size-10 text-red-500" />
              ) : (
                <ImageIcon className="size-10 text-blue-500" />
              )}
              <div className="min-w-0 flex-1">
                <Input
                  value={doc.name}
                  onChange={(e) => handleNameChange(doc.storage_id, e.target.value)}
                  placeholder="Document name"
                  className="h-8 text-sm"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => handleRemoveMulti(doc.storage_id)}
                className="text-slate-400 hover:text-red-600"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}

      {/* Active uploads */}
      {activeUploads.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3"
        >
          <Loader2 className="size-5 animate-spin text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-700">{item.file.name}</p>
            <p className="text-xs text-blue-600">Uploading...</p>
          </div>
        </div>
      ))}

      {/* Error files with retry */}
      {errorFiles.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3"
        >
          <X className="size-5 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-700">{item.file.name}</p>
            <p className="text-xs text-red-600">Upload failed</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleRetry(item)}
            className="h-7 border-red-300 text-red-600 hover:bg-red-50"
          >
            Retry
          </Button>
        </div>
      ))}

      {/* Upload zone */}
      {showUploadZone && (
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors",
            "border-slate-300 hover:border-slate-400 hover:bg-slate-50",
          )}
        >
          <Upload className="size-6 text-slate-400" />
          <span className="text-sm text-slate-600">
            {props.mode === "single" ? "Click to upload document" : "Click to add documents"}
          </span>
          <span className="text-xs text-slate-400">PDF, JPEG, or PNG (max 10MB)</span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            multiple={props.mode === "multi"}
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}
