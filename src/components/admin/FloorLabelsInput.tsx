"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { validateFloorLabels } from "../../../lib/validators";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FloorLabelsInputProps = {
  value: string[];
  action: (labels: string[]) => void;
  totalFloors?: number;
  disabled?: boolean;
};

export function FloorLabelsInput({
  value,
  action,
  totalFloors,
  disabled = false,
}: FloorLabelsInputProps) {
  const [pendingLabel, setPendingLabel] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);

  const normalizedSet = useMemo(() => {
    return new Set(value.map((label) => label.trim().toUpperCase()).filter(Boolean));
  }, [value]);

  function addLabel(rawValue: string) {
    const candidate = rawValue.trim().toUpperCase();

    if (!candidate) {
      return;
    }

    if (normalizedSet.has(candidate)) {
      setInlineError("Duplicate label");
      return;
    }

    try {
      const nextLabels = validateFloorLabels([...value, candidate]);
      action(nextLabels);
      setPendingLabel("");
      setInlineError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid floor label";
      setInlineError(message);
    }
  }

  function removeLabel(labelToRemove: string) {
    const nextLabels = value.filter((label) => label !== labelToRemove);
    action(nextLabels);
    setInlineError(null);
  }

  function quickAddFloors() {
    if (!totalFloors || totalFloors < 1) {
      setInlineError("Set total floors first to use quick add");
      return;
    }

    const floorNumbers = Array.from({ length: totalFloors }, (_, index) => String(index + 1));
    const labelsToAdd = floorNumbers.filter((label) => !normalizedSet.has(label));

    if (labelsToAdd.length === 0) {
      setInlineError(null);
      return;
    }

    try {
      const nextLabels = validateFloorLabels([...value, ...labelsToAdd]);
      action(nextLabels);
      setInlineError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add floor labels";
      setInlineError(message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {value.map((label, index) => (
          <Badge key={`${label}-${index}`} className="gap-1 bg-slate-100 text-slate-700">
            {label}
            <button
              type="button"
              aria-label={`Remove ${label}`}
              className="rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
              onClick={() => removeLabel(label)}
              disabled={disabled}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        {value.length === 0 ? (
          <p className="text-sm text-slate-500">No floor labels added yet.</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={pendingLabel}
          onChange={(event) => {
            setPendingLabel(event.target.value);
            if (inlineError) {
              setInlineError(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addLabel(pendingLabel);
            }
          }}
          onBlur={() => {
            if (pendingLabel.trim().length > 0) {
              addLabel(pendingLabel);
            }
          }}
          placeholder="Type floor label (e.g. B1, G, 1)"
          className="h-10 border-slate-300 sm:max-w-xs"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => addLabel(pendingLabel)}
          disabled={disabled}
        >
          Add Label
        </Button>
        <Button type="button" variant="outline" onClick={quickAddFloors} disabled={disabled}>
          Add floors 1-N
        </Button>
      </div>

      {inlineError ? <p className="text-sm text-red-600">{inlineError}</p> : null}
    </div>
  );
}
