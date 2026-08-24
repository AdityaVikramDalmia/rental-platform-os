"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TenantMessageDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Tenant Message Detail Error]", error);
  }, [error]);

  return (
    <Card className="border-amber-200 bg-amber-50/70 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-amber-900">
          Couldn&apos;t load this conversation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-amber-800">
        <p>The conversation may no longer be available. Check your connection and try again.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={reset}
            className="h-11 min-h-11 min-w-11"
          >
            Try again
          </Button>
          <Button asChild variant="outline" className="h-11 min-h-11 min-w-11">
            <Link href="/tenant/messages">Back to messages</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
