"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type CRMStatCardProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  totalCount: number | undefined;
  needsAttentionCount: number | undefined;
  description?: string;
  trend?: string;
};

export function CRMStatCard({
  href,
  label,
  icon: Icon,
  totalCount,
  needsAttentionCount,
  description,
  trend,
}: CRMStatCardProps) {
  return (
    <Link href={href} className="block">
      <Card className="h-full border-slate-200 transition-colors hover:border-slate-300">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium text-slate-700">{label}</CardTitle>
            <Icon className="size-4 text-slate-500" />
          </div>
          {description ? <p className="text-xs text-slate-500">{description}</p> : null}
        </CardHeader>

        <CardContent className="space-y-2">
          {totalCount === undefined ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <p className="text-3xl font-semibold tracking-tight text-slate-900">{totalCount}</p>
          )}

          {needsAttentionCount === undefined ? (
            <Skeleton className="h-4 w-44" />
          ) : (
            <p className="text-sm text-slate-600">
              <span className="font-medium text-amber-700">{needsAttentionCount}</span> need
              attention
            </p>
          )}

          {trend ? <p className="text-xs text-slate-500">{trend}</p> : null}
        </CardContent>
      </Card>
    </Link>
  );
}
