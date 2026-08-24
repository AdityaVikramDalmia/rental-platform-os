"use client";

import { useMutation } from "convex/react";
import { Camera, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type GuardPhotoUploadProps = {
  photoUrl: string | null | undefined;
  guardName: string;
  allowUpload?: boolean;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB before resize
const MAX_DIMENSION = 500;
const JPEG_QUALITY = 0.8;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create image blob"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

export function GuardPhotoUpload({
  photoUrl,
  guardName,
  allowUpload = true,
}: GuardPhotoUploadProps) {
  const t = useTranslations("guard.profile");
  const tCommon = useTranslations("guard.common");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.guards.generateUploadUrl);
  const updateMyPhoto = useMutation(api.guards.updateMyPhoto);

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        toast.error(tCommon("error"));
        return;
      }

      if (!file.type.startsWith("image/")) {
        toast.error(tCommon("error"));
        return;
      }

      setIsUploading(true);
      try {
        const resizedBlob = await resizeImage(file);
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          body: resizedBlob,
          headers: { "Content-Type": "image/jpeg" },
        });

        if (!result.ok) {
          throw new Error(tCommon("error"));
        }

        const { storageId } = (await result.json()) as { storageId: Id<"_storage"> };
        await updateMyPhoto({ storage_id: storageId });
        toast.success(tCommon("confirm"));
      } catch {
        toast.error(tCommon("error"));
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [generateUploadUrl, tCommon, updateMyPhoto],
  );

  const initials = getInitials(guardName);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Avatar className="size-[120px] border-[3px] border-slate-200 shadow-md">
          {photoUrl ? (
            <AvatarImage src={photoUrl} alt={guardName} className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-slate-800 text-2xl font-bold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
            <Loader2 className="size-8 animate-spin text-white" />
          </div>
        )}
      </div>

      {allowUpload && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleUpload}
            className="hidden"
            aria-label={t("title")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="h-9 min-h-11 min-w-11 gap-1.5 rounded-lg border-slate-300 px-3 text-sm font-medium text-slate-700"
          >
            <Camera className="size-4" />
            {isUploading ? tCommon("loading") : tCommon("save")}
          </Button>
        </>
      )}
    </div>
  );
}
