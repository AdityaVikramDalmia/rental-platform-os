import { QUALITY_FLAGS } from "../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type QualityFlagBadgeProps = {
  flags: string[];
};

type FlagConfig = {
  label: string;
  className: string;
  tooltip?: string;
};

const FLAG_CONFIG: Record<string, FlagConfig> = {
  [QUALITY_FLAGS.GUARD_HIGH_REJECTION]: {
    label: "⚠️ High Rejection Guard",
    className: "border-amber-300 bg-amber-100 text-amber-900",
    tooltip: "This guard has a high rejection rate in recent submissions.",
  },
  [QUALITY_FLAGS.DUPLICATE_FLAT_MATCH]: {
    label: "Duplicate (Flat)",
    className: "border-orange-300 bg-orange-100 text-orange-900",
  },
  [QUALITY_FLAGS.DUPLICATE_PHONE_MATCH]: {
    label: "Duplicate (Phone)",
    className: "border-orange-300 bg-orange-100 text-orange-900",
  },
  [QUALITY_FLAGS.OFF_SHIFT_SUBMISSION]: {
    label: "Off Shift",
    className: "border-slate-300 bg-slate-100 text-slate-700",
  },
};

export function QualityFlagBadge({ flags }: QualityFlagBadgeProps) {
  const resolvedFlags = flags
    .map((flag) => ({ flag, config: FLAG_CONFIG[flag] }))
    .filter((entry): entry is { flag: string; config: FlagConfig } => entry.config !== undefined);

  if (resolvedFlags.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-1.5">
        {resolvedFlags.map(({ flag, config }) => {
          const badge = <Badge className={config.className}>{config.label}</Badge>;

          if (!config.tooltip) {
            return <span key={flag}>{badge}</span>;
          }

          return (
            <Tooltip key={flag}>
              <TooltipTrigger asChild>{badge}</TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                {config.tooltip}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
