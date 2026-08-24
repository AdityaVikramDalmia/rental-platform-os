import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GuardUnauthorizedPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-2">
      <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center shadow-sm">
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="size-5 text-amber-700" />
        </div>
        <h1 className="text-lg font-semibold text-amber-900">
          This page is not available right now
        </h1>
        <p className="mt-2 text-sm text-amber-800">
          Your account can continue using active field-worker flows from the dashboard.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button asChild className="h-11 rounded-lg bg-slate-900 text-sm font-semibold">
            <Link href="/guard/dashboard">Go to field dashboard</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-lg text-sm font-semibold">
            <Link href="/ops/dashboard">Go to OPS dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
