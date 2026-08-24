"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "demorentals-view-mode";

export type ViewMode = "grid" | "list";

export type UseViewModeReturn = {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
};

export function useViewMode(): UseViewModeReturn {
  const [viewMode, setViewModeState] = useState<ViewMode>("grid");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "grid" || stored === "list") {
      // localStorage is unavailable during SSR; sync it post-mount so the server-rendered
      // markup matches the client's first hydration pass.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewModeState(stored);
    }
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // localStorage full or unavailable.
    }
  }, []);

  return { viewMode, setViewMode };
}
