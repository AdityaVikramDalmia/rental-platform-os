"use client";

import { useEffect, useRef } from "react";
import {
  CHORD_TIMEOUT_MS,
  isInputFocused,
  type ShortcutDefinition,
} from "@/lib/keyboard-shortcuts";

export function useKeyboardShortcuts(
  shortcuts: ShortcutDefinition[],
  handlers: Record<string, () => void>,
  options?: {
    onChordStart?: (key: string) => void;
    onChordEnd?: () => void;
  },
): void {
  const pendingChordKey = useRef<string | null>(null);
  const chordTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearPendingChord = () => {
      const hadPendingChord = pendingChordKey.current !== null;
      pendingChordKey.current = null;

      if (chordTimeout.current !== null) {
        clearTimeout(chordTimeout.current);
        chordTimeout.current = null;
      }

      if (hadPendingChord) {
        options?.onChordEnd?.();
      }
    };

    const handleShortcut = (shortcut: ShortcutDefinition, event: KeyboardEvent) => {
      const handler = handlers[shortcut.id];

      if (!handler) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      handler();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isInputFocused()) {
        return;
      }

      const pressedKey = event.key.toLowerCase();

      if (pendingChordKey.current) {
        const pendingKey = pendingChordKey.current;
        const matchedChord = shortcuts.find(
          (shortcut) =>
            shortcut.chord !== undefined &&
            shortcut.chord[0] === pendingKey &&
            shortcut.chord[1] === pressedKey,
        );

        clearPendingChord();

        if (matchedChord) {
          handleShortcut(matchedChord, event);
        }

        return;
      }

      const chordStarter = shortcuts.find(
        (shortcut) => shortcut.chord !== undefined && shortcut.chord[0] === pressedKey,
      );

      if (chordStarter) {
        pendingChordKey.current = pressedKey;
        options?.onChordStart?.(pressedKey);

        if (pressedKey === "g") {
          event.preventDefault();
        }

        if (chordTimeout.current !== null) {
          clearTimeout(chordTimeout.current);
        }

        chordTimeout.current = setTimeout(() => {
          clearPendingChord();
        }, CHORD_TIMEOUT_MS);
      }

      const singleKeyShortcut = shortcuts.find(
        (shortcut) => shortcut.key !== undefined && shortcut.key.toLowerCase() === pressedKey,
      );

      if (singleKeyShortcut) {
        handleShortcut(singleKeyShortcut, event);
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearPendingChord();
    };
  }, [handlers, options, shortcuts]);
}
