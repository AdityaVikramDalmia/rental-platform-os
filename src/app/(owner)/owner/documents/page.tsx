"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { FileCheck2, FolderOpen, MoveRight } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { OwnerDocumentRequirementCard } from "@/components/owner/documents/OwnerDocumentRequirementCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_KEYS = ["owner-doc-skeleton-1", "owner-doc-skeleton-2"] as const;

export default function OwnerDocumentsPage() {
  const data = useQuery(api.documents.getMyDocuments);

  if (data === undefined) {
    return (
      <div className="space-y-3">
        {SKELETON_KEYS.map((key) => (
          <Card key={key} className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (data.requirements.length === 0) {
    return (
      <Card className="border-dashed border-indigo-300 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <FolderOpen className="size-4 text-indigo-600" />
            No document requirements yet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            Once your onboarding or deal workflow starts, required documents will appear here.
          </p>
          <Button asChild className="w-full bg-indigo-600 text-white hover:bg-indigo-700">
            <Link href="/owner/service-requests">
              Track Service Requests
              <MoveRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-800">
        <p className="flex items-center gap-1.5 font-medium">
          <FileCheck2 className="size-3.5" />
          Upload JPEG, PNG, or PDF files up to 10MB.
        </p>
      </div>

      {data.requirements.map((requirement) => (
        <OwnerDocumentRequirementCard key={requirement._id} requirement={requirement} />
      ))}
    </section>
  );
}
