"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X, Maximize2, ImageOff } from "lucide-react";

function resolvePhotoUrl(storageId: string): string {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
  try {
    const parsed = new URL(convexUrl);
    if (parsed.hostname === "127.0.0.1") {
      parsed.hostname = "localhost";
    }
    return `${parsed.origin}/api/storage/${storageId}`;
  } catch {
    return `${convexUrl}/api/storage/${storageId}`;
  }
}

type PhotoGalleryProps = {
  photos: string[];
};

export function PhotoGallery({ photos }: PhotoGalleryProps) {
  const [current, setCurrent] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const total = photos.length;

  const thumbnailRef = useRef<HTMLDivElement>(null);
  const lightboxThumbRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);

  const goToPrevious = useCallback(() => {
    setCurrent((c) => (c === 0 ? total - 1 : c - 1));
  }, [total]);

  const goToNext = useCallback(() => {
    setCurrent((c) => (c === total - 1 ? 0 : c + 1));
  }, [total]);

  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          goToPrevious();
          break;
        case "ArrowRight":
          e.preventDefault();
          goToNext();
          break;
        case "Escape":
          setIsLightboxOpen(false);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen, goToPrevious, goToNext]);

  useEffect(() => {
    if (isLightboxOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isLightboxOpen]);

  useEffect(() => {
    const container = isLightboxOpen ? lightboxThumbRef.current : thumbnailRef.current;
    if (!container) return;
    const thumb = container.children[current] as HTMLElement | undefined;
    if (thumb) {
      thumb.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [current, isLightboxOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].screenX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const delta = touchStartX.current - e.changedTouches[0].screenX;
    if (Math.abs(delta) > 50) {
      delta > 0 ? goToNext() : goToPrevious();
    }
  };

  if (total === 0) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-2xl border border-dashed border-muted-foreground/20 bg-muted/50 sm:h-80 md:h-96">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="rounded-full bg-muted p-4">
            <ImageOff className="size-8" />
          </div>
          <span className="text-sm font-medium">Photos coming soon</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="group relative w-full overflow-hidden rounded-2xl bg-neutral-950">
        <button
          type="button"
          className="relative block w-full aspect-[4/3] cursor-pointer sm:aspect-[16/10]"
          onClick={() => setIsLightboxOpen(true)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Convex storage URLs are rendered directly in an interactive lightbox gallery. */}
          <img
            src={resolvePhotoUrl(photos[current])}
            alt={`Property ${current + 1} of ${total}`}
            className="h-full w-full object-cover transition-opacity duration-300"
            loading="eager"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/15" />
        </button>

        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md">
          {current + 1} <span className="text-white/40">/</span> {total}
        </div>

        <button
          type="button"
          onClick={() => setIsLightboxOpen(true)}
          className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md transition-all hover:scale-105 hover:bg-black/80 active:scale-95"
        >
          <Maximize2 className="size-3.5" />
          <span className="hidden sm:inline">View all photos</span>
        </button>

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToPrevious();
              }}
              className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur-md transition-all hover:scale-110 hover:bg-white/25 group-hover:opacity-100 active:scale-95"
              aria-label="Previous"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
              className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur-md transition-all hover:scale-110 hover:bg-white/25 group-hover:opacity-100 active:scale-95"
              aria-label="Next"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {total > 1 && (
        <div
          ref={thumbnailRef}
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {photos.map((photo, i) => (
            <button
              type="button"
              key={`thumb-${photo}`}
              onClick={() => setCurrent(i)}
              className={`relative flex-shrink-0 overflow-hidden rounded-lg transition-all duration-200 ${
                i === current
                  ? "ring-2 ring-blue-600 ring-offset-2 ring-offset-background"
                  : "opacity-60 hover:opacity-90"
              }`}
              aria-label={`View ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Convex storage URLs are rendered directly in an interactive lightbox gallery. */}
              <img
                src={resolvePhotoUrl(photo)}
                alt={`Thumbnail ${i + 1}`}
                className="h-16 w-20 object-cover sm:h-20 sm:w-24"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {isLightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen gallery"
          className="fixed inset-0 z-50 flex flex-col bg-black/95"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsLightboxOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setIsLightboxOpen(false);
          }}
        >
          <div className="flex shrink-0 items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-white/90">
              {current + 1} <span className="text-white/40">/</span> {total}
            </div>
            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              className="flex size-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="size-6" />
            </button>
          </div>

          <div
            className="flex min-h-0 flex-1 items-center justify-center px-4 sm:px-16"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="relative flex size-full items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- Convex storage URLs are rendered directly in an interactive lightbox gallery. */}
              <img
                src={resolvePhotoUrl(photos[current])}
                alt={`Property ${current + 1} of ${total}`}
                className="max-h-[85vh] max-w-[90vw] object-contain"
                loading="lazy"
              />

              {total > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToPrevious();
                    }}
                    className="absolute left-0 top-1/2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-all hover:scale-110 hover:bg-white/20 active:scale-95 sm:flex"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToNext();
                    }}
                    className="absolute right-0 top-1/2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-all hover:scale-110 hover:bg-white/20 active:scale-95 sm:flex"
                    aria-label="Next"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              )}
            </div>
          </div>

          {total > 1 && (
            <div className="shrink-0 px-4 pb-4 pt-2 sm:px-6">
              <div
                ref={lightboxThumbRef}
                className="flex justify-center gap-2 overflow-x-auto"
                style={{ scrollbarWidth: "none" }}
              >
                {photos.map((photo, i) => (
                  <button
                    type="button"
                    key={`lb-${photo}`}
                    onClick={() => setCurrent(i)}
                    className={`relative flex-shrink-0 overflow-hidden rounded-md transition-all duration-200 ${
                      i === current
                        ? "ring-2 ring-blue-600 ring-offset-1 ring-offset-black"
                        : "opacity-40 hover:opacity-70"
                    }`}
                    aria-label={`View ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Convex storage URLs are rendered directly in an interactive lightbox gallery. */}
                    <img
                      src={resolvePhotoUrl(photo)}
                      alt={`Thumbnail ${i + 1}`}
                      className="h-12 w-16 object-cover sm:h-14 sm:w-20"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
