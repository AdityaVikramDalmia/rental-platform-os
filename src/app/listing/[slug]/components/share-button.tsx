"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type ShareButtonProps = {
  slug: string;
  title: string;
};

export function ShareButton({ slug, title }: ShareButtonProps) {
  const handleShare = async () => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/listing/${slug}`;

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied!");
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        toast.error("Could not share link");
      }
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleShare}>
      <Share2 className="size-4" />
      Share
    </Button>
  );
}
