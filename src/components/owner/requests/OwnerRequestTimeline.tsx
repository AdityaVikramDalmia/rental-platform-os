"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Clock3, Headphones, MoveRight } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import {
  OWNER_SERVICE_REQUEST_STATUS,
  OWNER_SERVICE_REQUEST_STATUS_COLORS,
  OWNER_SERVICE_REQUEST_STATUS_LABELS,
  type OwnerServiceRequestStatus,
} from "../../../../lib/constants";
import { formatINR } from "../../../../lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STATUS_EXPLANATIONS: Record<OwnerServiceRequestStatus, string> = {
  [OWNER_SERVICE_REQUEST_STATUS.SUBMITTED]:
    "Your request is received and waiting for the onboarding team to contact you.",
  [OWNER_SERVICE_REQUEST_STATUS.CONTACTED]:
    "We have reached out and are validating your property and service fit.",
  [OWNER_SERVICE_REQUEST_STATUS.ONBOARDED]:
    "Your profile is onboarded. We are setting up RM and listing operations next.",
  [OWNER_SERVICE_REQUEST_STATUS.ACTIVE]:
    "Your owner account is active and your property support lifecycle has started.",
  [OWNER_SERVICE_REQUEST_STATUS.REJECTED]:
    "This request could not be onboarded. Please review the notes or submit a fresh request.",
  [OWNER_SERVICE_REQUEST_STATUS.DROPPED]:
    "This request is closed for now. You can submit a new request anytime.",
};

const SKELETON_KEYS = ["request-skeleton-1", "request-skeleton-2", "request-skeleton-3"] as const;

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function OwnerRequestTimeline() {
  const data = useQuery(api.ownerServiceRequests.getMyRequests);

  if (data === undefined) {
    return (
      <div className="space-y-3">
        {SKELETON_KEYS.map((key) => (
          <Card key={key} className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (data.requests.length === 0) {
    return (
      <Card className="border-dashed border-indigo-300 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <Headphones className="size-4 text-indigo-600" />
            No service requests yet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            Submit your first owner service request to start onboarding and RM support.
          </p>
          <Button asChild className="w-full bg-indigo-600 text-white hover:bg-indigo-700">
            <Link href="/owner-services">
              Go to Owner Services
              <MoveRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      {data.requests.map((request) => (
        <Card key={request._id} className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {request.property_type ?? "Property request"}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Submitted on {formatDate(request._creationTime)}
                </p>
              </div>
              <Badge
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide",
                  OWNER_SERVICE_REQUEST_STATUS_COLORS[
                    request.status as keyof typeof OWNER_SERVICE_REQUEST_STATUS_COLORS
                  ],
                )}
              >
                {OWNER_SERVICE_REQUEST_STATUS_LABELS[
                  request.status as keyof typeof OWNER_SERVICE_REQUEST_STATUS_LABELS
                ] ?? request.status}
              </Badge>
            </div>

            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
              {STATUS_EXPLANATIONS[request.status]}
            </div>

            <div className="space-y-1 text-xs text-slate-600">
              <p>
                <span className="font-medium text-slate-700">Location:</span>{" "}
                {request.location ?? "Not provided"}
              </p>
              <p>
                <span className="font-medium text-slate-700">Estimated Value:</span>{" "}
                {request.property_value ? formatINR(request.property_value) : "Not provided"}
              </p>
              {request.contacted_at ? (
                <p className="flex items-center gap-1.5 text-indigo-700">
                  <Clock3 className="size-3.5" />
                  Contacted on {formatDate(request.contacted_at)}
                </p>
              ) : null}
            </div>

            {request.owner_visible_notes ? (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                  Latest notes
                </p>
                <p className="mt-0.5 text-xs text-indigo-900">{request.owner_visible_notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
