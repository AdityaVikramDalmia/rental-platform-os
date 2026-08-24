import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type NavCardProps = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  borderClassName: string;
  iconBackgroundClassName: string;
  iconClassName: string;
  disabled?: boolean;
  badgeLabel?: string;
};

export function NavCard({
  title,
  description,
  href,
  icon: Icon,
  borderClassName,
  iconBackgroundClassName,
  iconClassName,
  disabled = false,
  badgeLabel,
}: NavCardProps) {
  const content = (
    <Card
      className={cn(
        "overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm transition",
        disabled ? "cursor-not-allowed opacity-50" : "hover:border-slate-300 hover:shadow-md",
      )}
    >
      <CardContent
        className={cn("relative flex min-h-20 items-center gap-3 border-l-4 p-4", borderClassName)}
      >
        {badgeLabel ? (
          <Badge
            variant="secondary"
            className="absolute right-3 top-3 rounded-full bg-slate-100 text-[10px] font-semibold uppercase text-slate-600"
          >
            {badgeLabel}
          </Badge>
        ) : null}

        <div
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
            iconBackgroundClassName,
          )}
        >
          <Icon className={cn("size-4", iconClassName)} />
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </CardContent>
    </Card>
  );

  if (disabled) {
    return content;
  }

  return (
    <Link
      href={href}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      {content}
    </Link>
  );
}
