import Link from "next/link";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ADMIN_LOGIN_COPY = {
  eyebrow: "Rental Platform OS",
  title: "Admin Login",
  description: "Use your DemoRentals Google account to access operations.",
  cta: "Sign in with Google",
  guardPrompt: "Guard?",
  guardLinkLabel: "Sign in here",
  guardLinkHref: "/guard/login",
} as const;

export default async function AdminLoginPage() {
  const signInUrl = await getSignInUrl();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-base text-slate-900">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center gap-6 py-8 md:py-12">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            {ADMIN_LOGIN_COPY.eyebrow}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            {ADMIN_LOGIN_COPY.title}
          </h1>
        </div>

        <Card className="w-full rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-slate-900">Sign in</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              {ADMIN_LOGIN_COPY.description}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <Button
              asChild
              className="h-11 min-h-11 w-full rounded-lg bg-slate-900 text-base font-semibold text-white hover:bg-slate-800"
            >
              <Link href={signInUrl}>{ADMIN_LOGIN_COPY.cta}</Link>
            </Button>

            <div className="border-t border-slate-200 pt-4 text-center">
              <p className="text-sm text-slate-600">
                {ADMIN_LOGIN_COPY.guardPrompt}{" "}
                <Link
                  href={ADMIN_LOGIN_COPY.guardLinkHref}
                  className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                >
                  {ADMIN_LOGIN_COPY.guardLinkLabel}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
