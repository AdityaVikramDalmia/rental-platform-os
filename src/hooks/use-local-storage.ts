"use client";

import { useCallback, useEffect, useState } from "react";

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(false);

    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(key);
      if (rawValue === null) {
        setStoredValue(initialValue);
      } else {
        setStoredValue(JSON.parse(rawValue) as T);
      }
    } catch {
      setStoredValue(initialValue);
    } finally {
      setIsReady(true);
    }
  }, [initialValue, key]);

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue((prevValue) =>
      typeof value === "function" ? (value as (prev: T) => T)(prevValue) : value,
    );
  }, []);

  useEffect(() => {
    if (!isReady || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch {}
  }, [isReady, key, storedValue]);

  return [storedValue, setValue, isReady];
}
