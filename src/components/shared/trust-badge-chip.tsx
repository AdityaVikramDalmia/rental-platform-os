import {
  Camera,
  ClipboardCheck,
  Clock,
  ShieldCheck,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { TRUST_BADGE_CONFIG, type TrustBadgeType } from "../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type TrustBadgeValue = {
  type: string;
  earned: boolean;
  timestamp?: number;
  count?: number;
};

type TrustBadgeChipProps = {
  badges: TrustBadgeValue[] | undefined;
  maxBadges?: number;
  className?: string;
};

const ICON_MAP: Record<string, LucideIcon> = {
  ShieldCheck,
  ClipboardCheck,
  Clock,
  Camera,
  Users,
  Trophy,
};

export function TrustBadgeChip({ badges, maxBadges = 3, className }: TrustBadgeChipProps) {
  const earnedBadges = (badges ?? [])
    .filter((badge) => badge.earned)
    .sort((left, right) => {
      const leftConfig = Object.prototype.hasOwnProperty.call(TRUST_BADGE_CONFIG, left.type)
        ? TRUST_BADGE_CONFIG[left.type as TrustBadgeType]
        : null;
      const rightConfig = Object.prototype.hasOwnProperty.call(TRUST_BADGE_CONFIG, right.type)
        ? TRUST_BADGE_CONFIG[right.type as TrustBadgeType]
        : null;

      const leftPriority = leftConfig?.priority ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = rightConfig?.priority ?? Number.MAX_SAFE_INTEGER;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.type.localeCompare(right.type);
    })
    .slice(0, maxBadges);

  if (earnedBadges.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {earnedBadges.map((badge) => {
        const config = Object.prototype.hasOwnProperty.call(TRUST_BADGE_CONFIG, badge.type)
          ? TRUST_BADGE_CONFIG[badge.type as TrustBadgeType]
          : {
              label: badge.type,
              color: "bg-slate-100 text-slate-700",
              iconName: "ShieldCheck",
              priority: Number.MAX_SAFE_INTEGER,
            };
        const Icon = ICON_MAP[config.iconName] ?? ShieldCheck;

        return (
          <Badge
            key={badge.type}
            variant="secondary"
            className={cn("gap-1 border-0", config.color)}
          >
            <Icon className="size-3" />
            <span>{config.label}</span>
          </Badge>
        );
      })}
    </div>
  );
}
