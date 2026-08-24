"use client";

import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

type FavoriteButtonProps = {
  listingId: string;
  isFavorite: boolean;
  onToggle: (id: string) => void;
  className?: string;
};

export function FavoriteButton({
  listingId,
  isFavorite,
  onToggle,
  className,
}: FavoriteButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(listingId);
      }}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 active:scale-90",
        isFavorite
          ? "bg-white text-red-500 shadow-red-200/50"
          : "bg-white/90 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-500",
        className,
      )}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      <Heart
        className={cn("size-4 transition-transform", isFavorite && "scale-110 fill-current")}
      />
    </button>
  );
}
