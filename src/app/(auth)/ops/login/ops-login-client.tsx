"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { opsLogin } from "./actions";
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

const opsLoginSchema = z.object({
  phone: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^\d{10}$/, "Enter a valid 10-digit phone number"),
  password: z.string().min(1, "Password is required"),
});

type OpsLoginValues = z.infer<typeof opsLoginSchema>;

interface OpsLoginClientProps {
  signInUrl: string;
}

function sanitizePhoneInput(value: string): string {
  const digitsOnly = value.replace(/\D/g, "");

  if (digitsOnly.length > 10 && digitsOnly.startsWith("91")) {
    return digitsOnly.slice(2, 12);
  }

  return digitsOnly.slice(0, 10);
}

export function OpsLoginClient({ signInUrl }: OpsLoginClientProps) {
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<OpsLoginValues>({
    resolver: zodResolver(opsLoginSchema),
    defaultValues: {
      phone: "",
      password: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: OpsLoginValues): Promise<void> {
    try {
      const result = await opsLogin(values.phone, values.password);

      if (result?.error) {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-slate-100 px-4 py-10 text-base text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">
            Rental Platform OS
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">OPS Portal Login</h1>
          <p className="text-sm font-medium text-slate-600">Field Operations</p>
        </div>

        <Card className="w-full rounded-xl border-emerald-100/80 bg-white shadow-sm shadow-emerald-100/60">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-slate-900">Sign in</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              Use Google SSO or your OPS phone number and password to continue.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Button asChild className="w-full" variant="outline">
                <Link href={signInUrl}>
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Sign in with Google
                </Link>
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                If your account was set up with Google, use the button above. Phone login is for
                accounts created with phone number only.
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-800">
                        Phone Number
                      </FormLabel>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">
                          +91
                        </span>
                        <FormControl>
                          <Input
                            {...field}
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel-national"
                            placeholder="9876543210"
                            className="h-11 min-h-11 rounded-lg border-slate-300 pl-14 text-base focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                            onChange={(event) => {
                              field.onChange(sanitizePhoneInput(event.target.value));
                            }}
                          />
                        </FormControl>
                      </div>
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
                      <div className="relative">
                        <FormControl>
                          <Input
                            {...field}
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            className="h-11 min-h-11 rounded-lg border-slate-300 pr-12 text-base focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-md text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                          onClick={() => setShowPassword((current) => !current)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </Button>
                      </div>
                      <FormMessage className="text-red-600" />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-11 min-h-11 w-full rounded-lg bg-emerald-600 text-base font-semibold tracking-wide text-white hover:bg-emerald-700"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            </Form>

            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-600">
                Forgot your password? Contact your supervisor.
              </p>

              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm text-slate-600">
                  Need admin access?{" "}
                  <Link
                    href="/admin/login"
                    className="font-semibold text-emerald-700 underline-offset-4 hover:underline"
                  >
                    Go to admin login
                  </Link>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
