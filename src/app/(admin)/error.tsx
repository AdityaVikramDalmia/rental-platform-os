"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Admin Portal Error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="mx-auto w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex size-12 items-center justify-center rounded-full bg-blue-50">
          <svg
            className="size-5 text-blue-600"
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
          An error occurred while loading this page. You can try again or return to the dashboard.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => (window.location.href = "/admin/dashboard")}>
            Dashboard
          </Button>
          <Button onClick={() => reset()}>Try again</Button>
        </div>

        {error.digest && <p className="mt-6 text-xs text-slate-400">Error ID: {error.digest}</p>}
      </div>
    </div>
  );
}
