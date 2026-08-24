"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { USER_TYPE } from "../../../lib/constants";

const FAVORITES_STORAGE_KEY = "demorentals-favorites";
const IMPORT_MARKER_PREFIX = "demorentals-favorites-imported:";

function readLocalFavoriteIds(): Id<"listings">[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const ids = parsed.filter((value): value is string => typeof value === "string");
    return ids.map((id) => id as Id<"listings">);
  } catch {
    return [];
  }
}

export function useTenantFavoritesSync() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const importFromLocalStorage = useMutation(api.tenantFavorites.importFromLocalStorage);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const tenantUserId = useMemo(() => {
    if (!currentUser || currentUser.user_type !== USER_TYPE.TENANT) {
      return null;
    }

    return currentUser._id;
  }, [currentUser]);

  useEffect(() => {
    if (typeof window === "undefined" || tenantUserId === null) {
      return;
    }

    const markerKey = `${IMPORT_MARKER_PREFIX}${String(tenantUserId)}`;
    if (window.localStorage.getItem(markerKey) === "true") {
      return;
    }

    if (inFlightRef.current) {
      return;
    }

    const listingIds = readLocalFavoriteIds();

    inFlightRef.current = importFromLocalStorage({ listing_ids: listingIds })
      .then(() => {
        window.localStorage.setItem(markerKey, "true");
      })
      .finally(() => {
        inFlightRef.current = null;
      });
  }, [importFromLocalStorage, tenantUserId]);

  return {
    tenantUserId,
    isTenant: tenantUserId !== null,
  };
}
