import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

export type SortState = {
  column: string;
  direction: SortDirection;
};

type SortableHeaderProps = {
  column: string;
  label: string;
  currentSort: SortState;
  onSortAction: (column: string) => void;
  className?: string;
};

export function SortableHeader({
  column,
  label,
  currentSort,
  onSortAction,
  className,
}: SortableHeaderProps) {
  const isActive = currentSort.column === column;
  const isAscending = isActive && currentSort.direction === "asc";

  const sortIcon = isActive ? (
    isAscending ? (
      <ArrowUp className="size-3.5" aria-hidden="true" />
    ) : (
      <ArrowDown className="size-3.5" aria-hidden="true" />
    )
  ) : (
    <ArrowUpDown className="size-3.5" aria-hidden="true" />
  );

  return (
    <th
      className={cn("px-3 py-2.5 font-medium", className)}
      aria-sort={isActive ? (isAscending ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSortAction(column)}
        className="inline-flex items-center gap-1 text-inherit transition-colors hover:text-slate-700"
      >
        <span>{label}</span>
        {sortIcon}
      </button>
    </th>
  );
}
