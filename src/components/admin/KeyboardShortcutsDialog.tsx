"use client";

import { KEYBOARD_SHORTCUTS, type ShortcutDefinition } from "@/lib/keyboard-shortcuts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type KeyboardShortcutsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath?: string;
};

const CATEGORY_ORDER: ShortcutDefinition["category"][] = ["Navigation", "Actions", "Global"];

function formatKeyLabel(key: string): string {
  return /^[a-z]$/.test(key) ? key.toUpperCase() : key;
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  currentPath,
}: KeyboardShortcutsDialogProps) {
  const shortcutsByCategory: Record<ShortcutDefinition["category"], ShortcutDefinition[]> = {
    Navigation: KEYBOARD_SHORTCUTS.filter((shortcut) => shortcut.category === "Navigation"),
    Actions: KEYBOARD_SHORTCUTS.filter((shortcut) => shortcut.category === "Actions").filter(
      (shortcut) => {
        if (!currentPath) {
          return true;
        }

        if (shortcut.id === "action.approve" || shortcut.id === "action.reject") {
          return currentPath.startsWith("/admin/leads");
        }

        return true;
      },
    ),
    Global: KEYBOARD_SHORTCUTS.filter((shortcut) => shortcut.category === "Global"),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {CATEGORY_ORDER.map((category) => {
            const shortcuts = shortcutsByCategory[category];

            if (shortcuts.length === 0) {
              return null;
            }

            return (
              <section key={category} className="rounded-lg border border-slate-200 p-3">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">{category}</h3>
                <div className="space-y-2">
                  {shortcuts.map((shortcut) => (
                    <div key={shortcut.id} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        {shortcut.chord ? (
                          <>
                            <kbd className="text-xs bg-muted border border-border px-1.5 py-0.5 rounded font-mono">
                              {formatKeyLabel(shortcut.chord[0])}
                            </kbd>
                            <span className="text-xs text-muted-foreground">then</span>
                            <kbd className="text-xs bg-muted border border-border px-1.5 py-0.5 rounded font-mono">
                              {formatKeyLabel(shortcut.chord[1])}
                            </kbd>
                          </>
                        ) : (
                          <kbd className="text-xs bg-muted border border-border px-1.5 py-0.5 rounded font-mono">
                            {formatKeyLabel(shortcut.key ?? "")}
                          </kbd>
                        )}
                      </div>
                      <span className="text-xs text-right text-slate-600">{shortcut.label}</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
