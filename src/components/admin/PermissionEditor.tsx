"use client";

import { useId, useMemo } from "react";
import { ALL_PERMISSIONS } from "../../../lib/constants";
import { Label } from "@/components/ui/label";

const PERMISSION_GROUPS = [
  {
    title: "Society & Building",
    prefixes: ["societies.", "buildings."],
  },
  {
    title: "Guard Management",
    prefixes: ["guards."],
  },
  {
    title: "Lead Management",
    prefixes: ["leads."],
  },
  {
    title: "Listing Management",
    prefixes: ["listings."],
  },
  {
    title: "Visit Management",
    prefixes: ["visits."],
  },
  {
    title: "Closure & Payout",
    prefixes: ["closures.", "payouts."],
  },
  {
    title: "Incentive Management",
    prefixes: ["incentives."],
  },
  {
    title: "Analytics & Audit",
    prefixes: ["analytics.", "audit."],
  },
  {
    title: "System Administration",
    prefixes: ["roles.", "admins.", "system."],
  },
] as const;

type PermissionEditorProps = {
  value: string[];
  action: (nextValue: string[]) => void;
  disabled?: boolean;
};

export function PermissionEditor({
  value,
  action,
  disabled = false,
}: PermissionEditorProps) {
  const baseId = useId();

  const groupedPermissions = useMemo(() => {
    return PERMISSION_GROUPS.map((group) => ({
      title: group.title,
      permissions: ALL_PERMISSIONS.filter((permission) =>
        group.prefixes.some((prefix) => permission.startsWith(prefix)),
      ),
    }));
  }, []);

  const selectedPermissions = useMemo(() => new Set(value), [value]);

  function togglePermission(permission: string, checked: boolean) {
    const nextPermissions = new Set(selectedPermissions);

    if (checked) {
      nextPermissions.add(permission);
    } else {
      nextPermissions.delete(permission);
    }

    action(Array.from(nextPermissions));
  }

  return (
    <div className="space-y-4">
      {groupedPermissions.map((group) => (
        <section
          key={group.title}
          className="rounded-lg border border-slate-200 bg-slate-50/70 p-4"
        >
          <h3 className="text-sm font-semibold text-slate-900">{group.title}</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {group.permissions.map((permission) => {
              const inputId = `${baseId}-${permission.replaceAll(".", "-")}`;

              return (
                <Label
                  key={permission}
                  htmlFor={inputId}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm font-normal text-slate-700 transition hover:border-slate-200 hover:bg-white"
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    className="size-4 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-400"
                    checked={selectedPermissions.has(permission)}
                    onChange={(event) =>
                      togglePermission(permission, event.currentTarget.checked)
                    }
                    disabled={disabled}
                  />
                  <span className="font-medium">{permission}</span>
                </Label>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
