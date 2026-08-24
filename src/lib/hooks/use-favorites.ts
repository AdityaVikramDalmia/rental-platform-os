"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "demorentals-favorites";

function readFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return new Set<string>(
      Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function writeFavorites(favorites: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
  } catch {
    // localStorage full or unavailable.
  }
}

export type UseFavoritesReturn = {
  favorites: Set<string>;
  toggleFavorite: (listingId: string) => void;
  isFavorite: (listingId: string) => boolean;
  favoritesCount: number;
};

export function useFavorites(): UseFavoritesReturn {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    // localStorage is unavailable during SSR; sync it post-mount so the server-rendered
    // markup matches the client's first hydration pass.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorites(readFavorites());
  }, []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setFavorites(readFavorites());
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const toggleFavorite = useCallback((listingId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(listingId)) {
        next.delete(listingId);
      } else {
        next.add(listingId);
      }
      writeFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((listingId: string) => favorites.has(listingId), [favorites]);

  return {
    favorites,
    toggleFavorite,
    isFavorite,
    favoritesCount: favorites.size,
  };
}
