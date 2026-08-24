import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type WarningBadgeProps = {
  level: number;
  count?: number;
  compact?: boolean;
};

const WARNING_LEVEL_STYLES: Record<number, { badge: string; dot: string }> = {
  1: {
    badge: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
  },
  2: {
    badge: "bg-orange-100 text-orange-800",
    dot: "bg-orange-500",
  },
  3: {
    badge: "bg-red-100 text-red-800",
    dot: "bg-red-600",
  },
};

export function WarningBadge({ level, count, compact = false }: WarningBadgeProps) {
  const resolvedLevel = level >= 3 ? 3 : level <= 1 ? 1 : 2;
  const style = WARNING_LEVEL_STYLES[resolvedLevel];
  const tooltipText =
    count === undefined
      ? `Warning level ${resolvedLevel}`
      : `Warning level ${resolvedLevel} (${count} active)`;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-block size-2.5 rounded-full ${style.dot}`} />
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Badge className={style.badge}>
      L{resolvedLevel}
      {count !== undefined ? ` (${count})` : ""}
    </Badge>
  );
}
