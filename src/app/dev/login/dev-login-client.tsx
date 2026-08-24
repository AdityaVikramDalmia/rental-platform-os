"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Bot, Home, Loader2, Shield, ShieldCheck, Users, Wrench } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { devLogin, devLoginWithPreset } from "./actions";
import type { DevAccountIcon, DevAccountSummary } from "./accounts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const ACCOUNT_ICONS: Record<DevAccountIcon, typeof Shield> = {
  admin: Shield,
  agent: Bot,
  guard: ShieldCheck,
  ops: Wrench,
  owner: Home,
  tenant: Users,
};

const devLoginSchema = z.object({
  email: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

type DevLoginValues = z.infer<typeof devLoginSchema>;

const FALLBACK_LOGIN_ERROR_MESSAGE = "Unable to sign in right now. Please try again.";

function toLoginErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return FALLBACK_LOGIN_ERROR_MESSAGE;
  }

  if (error.message.toLowerCase().includes("fetch failed")) {
    return FALLBACK_LOGIN_ERROR_MESSAGE;
  }

  return error.message;
}

type DevLoginClientProps = {
  quickAccessAccounts: DevAccountSummary[];
  moreAccounts: DevAccountSummary[];
  localAuthEnabled: boolean;
};

function DevLoginClient({
  quickAccessAccounts,
  moreAccounts,
  localAuthEnabled,
}: DevLoginClientProps) {
  const router = useRouter();
  const [presetLoading, setPresetLoading] = useState<string | null>(null);

  const form = useForm<DevLoginValues>({
    resolver: zodResolver(devLoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: DevLoginValues): Promise<void> {
    try {
      const result = await devLogin(values.email, values.password);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.redirectTo) {
        router.replace(result.redirectTo);
      }
    } catch (error: unknown) {
      toast.error(toLoginErrorMessage(error));
    }
  }

  async function loginWithPreset(accountId: string): Promise<void> {
    setPresetLoading(accountId);

    try {
      const result = await devLoginWithPreset(accountId);

      if (result.error) {
        toast.error(result.error);
        setPresetLoading(null);
        return;
      }

      if (result.redirectTo) {
        setPresetLoading(null);
        router.replace(result.redirectTo);
        return;
      }

      setPresetLoading(null);
    } catch (error: unknown) {
      toast.error(toLoginErrorMessage(error));
      setPresetLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-base text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Rental Platform OS
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dev Login</h1>
          <p className="text-sm text-red-600 font-medium">
            Development only — not available in production
          </p>
        </div>

        <Card className="w-full rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-slate-900">Quick Login</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              One-click access to each persona.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {quickAccessAccounts.map((account) => {
              const Icon = ACCOUNT_ICONS[account.icon];
              const isLoading = presetLoading === account.id;
              return (
                <Button
                  key={account.id}
                  type="button"
                  variant="outline"
                  className="h-14 w-full justify-start gap-3"
                  disabled={isSubmitting || presetLoading !== null}
                  onClick={() => loginWithPreset(account.id)}
                >
                  {isLoading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <Icon className="size-5 text-slate-600" />
                  )}
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-900">{account.label}</p>
                    <p className="text-xs text-slate-500">{account.description}</p>
                  </div>
                </Button>
              );
            })}

            {!localAuthEnabled && (
              <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">
                  More Accounts
                </summary>
                <div className="mt-3 space-y-2">
                  {moreAccounts.map((account) => {
                    const Icon = ACCOUNT_ICONS[account.icon];
                    const isLoading = presetLoading === account.id;

                    return (
                      <Button
                        key={account.id}
                        type="button"
                        variant="outline"
                        className="h-12 w-full justify-start gap-3 bg-white"
                        disabled={isSubmitting || presetLoading !== null}
                        onClick={() => loginWithPreset(account.id)}
                      >
                        {isLoading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Icon className="size-4 text-slate-600" />
                        )}
                        <div className="text-left">
                          <p className="text-sm font-medium text-slate-900">{account.label}</p>
                          <p className="text-xs text-slate-500">{account.description}</p>
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </details>
            )}
          </CardContent>
        </Card>

        <Card className="w-full rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-slate-900">Manual Login</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              {localAuthEnabled
                ? "Enter one of the five seeded local demo accounts."
                : "Enter any WorkOS email + password."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-800">Email</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          className="h-11 min-h-11 rounded-lg border-slate-300 text-base"
                        />
                      </FormControl>
                      <FormMessage className="text-red-600" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-800">Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          autoComplete="current-password"
                          className="h-11 min-h-11 rounded-lg border-slate-300 text-base"
                        />
                      </FormControl>
                      <FormMessage className="text-red-600" />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={isSubmitting || presetLoading !== null}
                  className="h-11 min-h-11 w-full rounded-lg bg-slate-900 text-base font-semibold tracking-wide text-white hover:bg-slate-800"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "LOG IN"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Link
          href="/"
          className="text-sm text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline"
        >
          Back to portal selector
        </Link>
      </div>
    </div>
  );
}

export default DevLoginClient;
