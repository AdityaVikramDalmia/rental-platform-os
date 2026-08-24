"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, ImageIcon, Star, Trash2 } from "lucide-react";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

type PhotoManagerProps = {
  listingId: Id<"listings">;
  onPhotoCountChange?: (count: number) => void;
};

export function PhotoManager({ listingId, onPhotoCountChange }: PhotoManagerProps) {
  const photos = useQuery(api.listings.getPhotosForListing, { listing_id: listingId });
  const removePhotoMutation = useMutation(api.listings.removePhoto);
  const reorderPhotosMutation = useMutation(api.listings.reorderPhotos);

  useEffect(() => {
    if (photos !== undefined) {
      onPhotoCountChange?.(photos.length);
    }
  }, [photos, onPhotoCountChange]);

  const handleRemove = useCallback(
    async (photoId: Id<"listing_photos">) => {
      try {
        await removePhotoMutation({ photo_id: photoId });
        toast.success("Photo removed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove photo");
      }
    },
    [removePhotoMutation],
  );

  const handleMove = useCallback(
    async (index: number, direction: "up" | "down") => {
      if (!photos) return;

      const newPhotos = [...photos];
      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= newPhotos.length) return;

      [newPhotos[index], newPhotos[targetIndex]] = [newPhotos[targetIndex], newPhotos[index]];

      try {
        await reorderPhotosMutation({
          listing_id: listingId,
          photo_ids: newPhotos.map((p) => p._id),
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to reorder photos");
      }
    },
    [photos, listingId, reorderPhotosMutation],
  );

  if (!photos || photos.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center">
        <ImageIcon className="mx-auto size-8 text-slate-300" />
        <p className="text-sm text-slate-500">No photos yet. Upload above.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {photos.map((photo, index) => (
        <div
          key={photo._id}
          className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
        >
          {photo.url ? (
            <img
              src={photo.url}
              alt={`Photo ${index + 1}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="size-8 text-slate-300" />
            </div>
          )}

          {index === 0 && (
            <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              <Star className="size-2.5" />
              Cover
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === 0}
                onClick={() => handleMove(index, "up")}
                className="size-6 text-white hover:bg-white/20 hover:text-white disabled:opacity-30"
              >
                <ArrowUp className="size-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === photos.length - 1}
                onClick={() => handleMove(index, "down")}
                className="size-6 text-white hover:bg-white/20 hover:text-white disabled:opacity-30"
              >
                <ArrowDown className="size-3" />
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => handleRemove(photo._id)}
              className="size-6 text-red-300 hover:bg-red-500/30 hover:text-white"
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
