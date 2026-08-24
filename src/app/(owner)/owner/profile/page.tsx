"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { OwnerProfileCard } from "@/components/owner/profile/OwnerProfileCard";
import { OwnerRmContactCard } from "@/components/owner/profile/OwnerRmContactCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_KEYS = ["owner-profile-skeleton-1", "owner-profile-skeleton-2"] as const;

export default function OwnerProfilePage() {
  const owner = useQuery(api.owners.getMyOwnerProfile);
  const ownerId = owner?._id;
  const includeRmData = Boolean(ownerId);

  const rmAssignment = useQuery(
    api.owners.getMyRmAssignment,
    ownerId ? { owner_id: ownerId } : "skip",
  );
  const checkIns = useQuery(
    api.owners.getMyCheckIns,
    ownerId ? { owner_id: ownerId, limit: 20 } : "skip",
  );

  if (
    owner === undefined ||
    (includeRmData && (rmAssignment === undefined || checkIns === undefined))
  ) {
    return (
      <div className="space-y-3">
        {SKELETON_KEYS.map((key) => (
          <Card key={key} className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!owner) {
    return (
      <Card className="border-dashed border-indigo-300 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <UserRound className="size-4 text-indigo-600" />
            Owner profile not found
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            We could not find your owner profile yet. Please submit a service request to start
            onboarding.
          </p>
          <Button asChild className="w-full bg-indigo-600 text-white hover:bg-indigo-700">
            <Link href="/owner/service-requests">Go to Service Requests</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <OwnerProfileCard owner={owner} />
      <OwnerRmContactCard assignment={rmAssignment ?? null} checkIns={checkIns ?? []} />
    </section>
  );
}
