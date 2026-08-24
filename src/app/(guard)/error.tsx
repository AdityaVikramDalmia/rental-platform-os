"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GuardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Guard Portal Error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="mx-auto w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex size-12 items-center justify-center rounded-full bg-amber-50">
          <svg
            className="size-5 text-amber-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Something went wrong
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          An error occurred while loading this page. Please try again.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Button className="w-full" onClick={() => reset()}>
            Try again
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => (window.location.href = "/guard/dashboard")}
          >
            Back to dashboard
          </Button>
        </div>

        {error.digest && <p className="mt-6 text-xs text-slate-400">Error ID: {error.digest}</p>}
      </div>
    </div>
  );
}
