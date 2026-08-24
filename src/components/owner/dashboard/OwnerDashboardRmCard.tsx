"use client";

import Link from "next/link";
import { MessageCircle, Phone, UserRound } from "lucide-react";
import { formatRelativeTime } from "../../../../lib/dates";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type OwnerDashboardRmContact = {
  rm_name: string;
  rm_phone: string;
  status: string;
  last_check_in_at: number | null;
  next_check_in_due: number | null;
};

type OwnerDashboardRmCardProps = {
  rmContact?: OwnerDashboardRmContact | null;
};

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (words.length === 0) {
    return "RM";
  }

  return words.map((word) => word[0]?.toUpperCase() ?? "").join("");
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

function formatPhoneDisplay(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.length === 12 && normalized.startsWith("91")) {
    const local = normalized.slice(2);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return phone;
}

export function OwnerDashboardRmCard({ rmContact }: OwnerDashboardRmCardProps) {
  if (rmContact === undefined) {
    return (
      <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-8 w-full" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (rmContact === null) {
    return (
      <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-indigo-700">
            <UserRound className="size-4" />
            <p className="text-sm font-semibold">No RM assigned yet</p>
          </div>
          <p className="text-sm text-slate-600">
            Our support team can help you with listing and tenant coordination in the meantime.
          </p>
          <Button asChild className="w-full bg-indigo-600 hover:bg-indigo-700">
            <Link href="/owner/service-requests">Contact Support</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const rmPhone = normalizePhone(rmContact.rm_phone);
  const rmPhoneDisplay = formatPhoneDisplay(rmContact.rm_phone);

  return (
    <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <Avatar className="size-10 border border-indigo-200">
            <AvatarFallback className="bg-indigo-100 text-xs font-semibold text-indigo-700">
              {getInitials(rmContact.rm_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{rmContact.rm_name}</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge className="border-0 bg-white/80 text-[10px] uppercase tracking-[0.08em] text-violet-700">
                {rmContact.status}
              </Badge>
            </div>
            {rmContact.last_check_in_at ? (
              <p className="mt-1 text-xs text-slate-600">
                Last check-in {formatRelativeTime(rmContact.last_check_in_at)}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-600">No check-in logged yet</p>
            )}
          </div>
        </div>

        {rmPhone ? (
          <p className="text-xs font-medium text-slate-700">{rmPhoneDisplay}</p>
        ) : (
          <p className="text-xs text-slate-600">Contact details unavailable right now</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            asChild
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700"
            disabled={!rmPhone}
          >
            <a href={rmPhone ? `tel:+${rmPhone}` : undefined}>
              <Phone className="mr-1.5 size-3.5" />
              Call
            </a>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-indigo-200 bg-white/70 text-indigo-700 hover:bg-indigo-100"
            disabled={!rmPhone}
          >
            <a
              href={rmPhone ? `https://wa.me/${rmPhone}` : undefined}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="mr-1.5 size-3.5" />
              WhatsApp
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
