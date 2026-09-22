import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type HostedLoginPageProps = {
  description: string;
  error?: string;
  signInUrl: string;
  title: string;
};

export function HostedLoginPage({ description, error, signInUrl, title }: HostedLoginPageProps) {
  const roleMismatch = error === "role_mismatch";
  const accessNotConfigured = error === "access_not_configured";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-base text-slate-900">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center gap-6 py-8 md:py-12">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Rental Platform OS
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        </div>

        <Card className="w-full rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-slate-900">Sign in</CardTitle>
            <CardDescription className="text-sm text-slate-600">{description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {roleMismatch || accessNotConfigured ? (
              <div
                role="alert"
                className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p>
                  {accessNotConfigured
                    ? "This account has no portal role assigned. Contact an administrator."
                    : "This account does not have access to the selected portal."}
                </p>
              </div>
            ) : null}

            <Button
              asChild
              className="h-11 min-h-11 w-full rounded-lg bg-slate-900 text-base font-semibold text-white hover:bg-slate-800"
            >
              <Link href={signInUrl}>Continue to sign in</Link>
            </Button>

            <div className="border-t border-slate-200 pt-4 text-center">
              <Link
                href="/homepage"
                className="text-sm font-semibold text-slate-700 underline-offset-4 hover:underline"
              >
                Back to DemoRentals
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
