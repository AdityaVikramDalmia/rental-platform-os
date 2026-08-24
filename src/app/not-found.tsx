import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="mx-auto w-full max-w-md text-center">
        <p className="text-8xl font-bold tracking-tighter text-slate-200">404</p>

        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">Page not found</h1>

        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="mt-8">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
        </div>

        <p className="mt-12 text-xs text-slate-400">Rental Platform OS</p>
      </div>
    </div>
  );
}
