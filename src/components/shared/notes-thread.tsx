"use client";

import { formatRelativeTime } from "../../../lib/dates";
import { cn } from "@/lib/utils";

type NoteEntry = {
  note: string;
  author_id: string;
  author_name: string;
  author_type: "ADMIN" | "GUARD" | "OPS";
  timestamp: number;
};

type NotesThreadProps = {
  notes: NoteEntry[];
  className?: string;
};

const AUTHOR_TYPE_STYLES = {
  ADMIN: "bg-blue-100 text-blue-700",
  GUARD: "bg-emerald-100 text-emerald-700",
  OPS: "bg-amber-100 text-amber-700",
} as const;

export function NotesThread({ notes, className }: NotesThreadProps) {
  if (notes.length === 0) {
    return <p className={cn("text-sm text-slate-400 italic", className)}>No notes yet.</p>;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {notes.map((entry, index) => (
        <div
          key={`${entry.author_id}-${entry.timestamp}-${index}`}
          className="rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-3"
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                AUTHOR_TYPE_STYLES[entry.author_type],
              )}
            >
              {entry.author_type === "ADMIN"
                ? "Admin"
                : entry.author_type === "OPS"
                  ? "Ops"
                  : "Guard"}
            </span>
            <span className="text-xs text-slate-400">{entry.author_name}</span>
            <span className="ml-auto text-xs text-slate-400">
              {formatRelativeTime(entry.timestamp)}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-slate-700">{entry.note}</p>
        </div>
      ))}
    </div>
  );
}
