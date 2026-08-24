import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type StatCardProps = {
  href: string;
  label: string;
  value: number | string | undefined;
  icon: LucideIcon;
  iconBackgroundClassName: string;
  iconClassName: string;
  isLoading?: boolean;
};

export function StatCard({
  href,
  label,
  value,
  icon: Icon,
  iconBackgroundClassName,
  iconClassName,
  isLoading = false,
}: StatCardProps) {
  return (
    <Link href={href} className="block focus-visible:outline-none">
      <Card className="h-full rounded-xl border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-emerald-500">
        <CardContent className="flex min-h-28 flex-col justify-between gap-4 p-4">
          <div
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full",
              iconBackgroundClassName,
            )}
          >
            <Icon className={cn("size-4", iconClassName)} />
          </div>

          <div className="space-y-1">
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <p className="text-3xl font-semibold leading-none text-slate-900">
                {value === undefined ? "\u2014" : value}
              </p>
            )}
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
