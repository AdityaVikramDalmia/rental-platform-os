"use client";

import { useMutation } from "convex/react";
import {
  Archive,
  CheckCircle,
  Copy,
  ExternalLink,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { LISTING_STATUS, type ListingStatus } from "../../../../../../lib/constants";
import { Button } from "@/components/ui/button";

type ListingStatusControlsProps = {
  listingId: Id<"listings">;
  status: ListingStatus;
  slug: string;
  photoCount: number;
};

export function ListingStatusControls({
  listingId,
  status,
  slug,
  photoCount,
}: ListingStatusControlsProps) {
  const publishListing = useMutation(api.listings.publish);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleStatusChange = useCallback(
    async (newStatus: ListingStatus, actionLabel: string) => {
      setLoadingAction(actionLabel);
      try {
        await publishListing({ listing_id: listingId, new_status: newStatus });
        toast.success(`Listing ${actionLabel.toLowerCase()}d`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : `Failed to ${actionLabel.toLowerCase()}`,
        );
      } finally {
        setLoadingAction(null);
      }
    },
    [listingId, publishListing],
  );

  const handleCopyLink = useCallback(() => {
    const publicUrl = `${window.location.origin}/listing/${slug}`;
    navigator.clipboard.writeText(publicUrl);
    toast.success("Public link copied to clipboard");
  }, [slug]);

  const handleOpenPublic = useCallback(() => {
    window.open(`/listing/${slug}`, "_blank");
  }, [slug]);

  const isLoading = loadingAction !== null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === LISTING_STATUS.DRAFT && (
        <Button
          type="button"
          disabled={isLoading || photoCount < 1}
          onClick={() => handleStatusChange(LISTING_STATUS.PUBLISHED as ListingStatus, "Publish")}
          className="gap-1.5 bg-green-600 text-white hover:bg-green-700"
          title={photoCount < 1 ? "Add at least 1 photo before publishing" : undefined}
        >
          {loadingAction === "Publish" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle className="size-4" />
          )}
          Publish
        </Button>
      )}

      {status === LISTING_STATUS.PUBLISHED && (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isLoading}
            onClick={() => handleStatusChange(LISTING_STATUS.DRAFT as ListingStatus, "Un-publish")}
            className="gap-1.5"
          >
            {loadingAction === "Un-publish" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <XCircle className="size-4" />
            )}
            Un-publish
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isLoading}
            onClick={() => handleStatusChange(LISTING_STATUS.ARCHIVED as ListingStatus, "Archive")}
            className="gap-1.5 text-slate-600"
          >
            {loadingAction === "Archive" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Archive className="size-4" />
            )}
            Archive
          </Button>
        </>
      )}

      {status === LISTING_STATUS.ARCHIVED && (
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={() => handleStatusChange(LISTING_STATUS.DRAFT as ListingStatus, "Re-list")}
          className="gap-1.5"
        >
          {loadingAction === "Re-list" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RotateCcw className="size-4" />
          )}
          Re-list
        </Button>
      )}

      <div className="ml-auto flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopyLink}
          className="gap-1.5 text-xs"
        >
          <Copy className="size-3.5" />
          Copy Public Link
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpenPublic}
          className="gap-1.5 text-xs"
        >
          <ExternalLink className="size-3.5" />
          Open Public Page
        </Button>
      </div>
    </div>
  );
}
