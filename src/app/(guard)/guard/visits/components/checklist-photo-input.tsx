"use client";

import { useMutation } from "convex/react";
import { Camera, Loader2, Trash2, ImageIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

type PhotoMeta = {
  storage_id: Id<"_storage">;
  taken_at: number;
  lat?: number;
  lng?: number;
};

type LocalPhoto = {
  storageId: Id<"_storage">;
  blobUrl: string;
};

type ChecklistPhotoInputProps = {
  photoIds: Id<"_storage">[];
  photoMetadata: PhotoMeta[];
  onPhotosChange: (ids: Id<"_storage">[], metadata: PhotoMeta[]) => void;
  maxPhotos?: number;
  disabled?: boolean;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function ChecklistPhotoInput({
  photoIds,
  photoMetadata,
  onPhotosChange,
  maxPhotos = 5,
  disabled,
}: ChecklistPhotoInputProps) {
  const [localPhotos, setLocalPhotos] = useState<LocalPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.checklists.generateUploadUrl);

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!file.type.match(/^image\/(jpeg|png)$/)) {
        toast.error("Only JPEG and PNG images are allowed");
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error("Photo too large. Maximum 10MB");
        return;
      }

      if (photoIds.length >= maxPhotos) {
        toast.error(`Maximum ${maxPhotos} photos allowed`);
        return;
      }

      setIsUploading(true);

      try {
        const uploadUrl = await generateUploadUrl();

        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!result.ok) throw new Error("Upload failed");

        const { storageId } = (await result.json()) as {
          storageId: Id<"_storage">;
        };

        let lat: number | undefined;
        let lng: number | undefined;
        try {
          if (navigator.geolocation) {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                timeout: 5000,
                enableHighAccuracy: false,
              });
            });
            lat = position.coords.latitude;
            lng = position.coords.longitude;
          }
        } catch {
          // GPS unavailable is expected on desktop or when permission is denied
        }

        const metadata: PhotoMeta = {
          storage_id: storageId,
          taken_at: Date.now(),
          lat,
          lng,
        };

        const blobUrl = URL.createObjectURL(file);
        setLocalPhotos((prev) => [...prev, { storageId, blobUrl }]);

        const newIds = [...photoIds, storageId];
        const newMetadata = [...photoMetadata, metadata];
        onPhotosChange(newIds, newMetadata);

        toast.success("Photo uploaded");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        toast.error(message);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [generateUploadUrl, onPhotosChange, photoIds, photoMetadata, maxPhotos],
  );

  const handleRemove = useCallback(
    (storageId: Id<"_storage">) => {
      setLocalPhotos((prev) => {
        const photo = prev.find((p) => p.storageId === storageId);
        if (photo) URL.revokeObjectURL(photo.blobUrl);
        return prev.filter((p) => p.storageId !== storageId);
      });

      const newIds = photoIds.filter((id) => id !== storageId);
      const newMetadata = photoMetadata.filter((m) => m.storage_id !== storageId);
      onPhotosChange(newIds, newMetadata);
    },
    [onPhotosChange, photoIds, photoMetadata],
  );

  const canAddMore = photoIds.length < maxPhotos && !disabled;

  return (
    <div className="space-y-3">
      {photoIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photoIds.map((id) => {
            const local = localPhotos.find((p) => p.storageId === id);
            return (
              <div key={String(id)} className="group relative">
                <div className="relative size-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {local ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Blob object URLs are generated client-side for immediate previews.
                    <img
                      src={local.blobUrl}
                      alt="Upload preview"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <ImageIcon className="size-6 text-slate-300" />
                    </div>
                  )}
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(id)}
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition-transform hover:scale-110"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
          disabled={!canAddMore || isUploading}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAddMore || isUploading}
          onClick={() => fileInputRef.current?.click()}
          className="h-10 min-h-[44px] gap-2 rounded-lg border-slate-300 px-4 text-sm font-medium text-slate-700"
        >
          {isUploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Camera className="size-4" />
          )}
          {isUploading ? "Uploading..." : "Add Photo"}
        </Button>
        <span className="text-sm text-slate-500">
          {photoIds.length}/{maxPhotos}
        </span>
      </div>
    </div>
  );
}
