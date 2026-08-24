"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, Mail, UserRound } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { USER_TYPE } from "../../../../../lib/constants";
import { TenantProfileForm } from "@/components/tenant/profile/tenant-profile-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TenantProfilePage() {
  const profile = useQuery(api.tenantProfile.getMine);

  if (profile === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-[520px] rounded-xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card className="border-dashed border-cyan-300 bg-white shadow-sm">
        <CardContent className="py-4 text-sm text-slate-600">
          Unable to load tenant profile.
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4 pb-6">
      <Card className="border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl text-slate-900">Profile settings</CardTitle>
          <p className="text-sm text-slate-600">
            Keep your account details and search preferences up to date.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-cyan-100 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Email</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-900">
                <Mail className="size-4 text-cyan-700" />
                {profile.email || "Not available"}
              </p>
            </div>

            <div className="rounded-lg border border-cyan-100 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">User type</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-900">
                <UserRound className="size-4 text-cyan-700" />
                {USER_TYPE.TENANT}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild variant="outline" className="h-11 min-h-11 border-cyan-200 bg-white">
              <Link href="/tenant/referrals" className="justify-between">
                Manage referrals
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 min-h-11 border-cyan-200 bg-white">
              <Link href="/listings" className="justify-between">
                Browse listings
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <TenantProfileForm profile={profile} />
    </section>
  );
}
