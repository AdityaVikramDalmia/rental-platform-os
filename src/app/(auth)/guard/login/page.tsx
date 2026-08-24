"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { guardLogin } from "./actions";
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

function sanitizePhoneInput(value: string): string {
  const digitsOnly = value.replace(/\D/g, "");

  if (digitsOnly.length > 10 && digitsOnly.startsWith("91")) {
    return digitsOnly.slice(2, 12);
  }

  return digitsOnly.slice(0, 10);
}

function GuardLoginPage() {
  const t = useTranslations("guard.login");
  const [showPassword, setShowPassword] = useState(false);
  const guardLoginSchema = z.object({
    phone: z
      .string()
      .min(1, t("phoneRequired"))
      .regex(/^\d{10}$/, t("phoneInvalid")),
    password: z.string().min(1, t("passwordRequired")),
  });

  type GuardLoginValues = z.infer<typeof guardLoginSchema>;

  const form = useForm<GuardLoginValues>({
    resolver: zodResolver(guardLoginSchema),
    defaultValues: {
      phone: "",
      password: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: GuardLoginValues): Promise<void> {
    const result = await guardLogin(values.phone, values.password);

    if (result?.error) {
      toast.error(result.error);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-base text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Rental Platform OS
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("title")}</h1>
        </div>

        <Card className="w-full rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg text-slate-900">{t("signIn")}</CardTitle>
            <CardDescription className="text-sm text-slate-600">{t("subtitle")}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-800">
                        {t("phoneLabel")}
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
                            placeholder={t("phonePlaceholder")}
                            className="h-11 min-h-11 rounded-lg border-slate-300 pl-14 text-base"
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
                      <FormLabel className="text-sm font-medium text-slate-800">
                        {t("passwordLabel")}
                      </FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            {...field}
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            className="h-11 min-h-11 rounded-lg border-slate-300 pr-12 text-base"
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          onClick={() => setShowPassword((current) => !current)}
                          aria-label={showPassword ? t("hidePassword") : t("showPassword")}
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
                  className="h-11 min-h-11 w-full rounded-lg bg-slate-900 text-base font-semibold tracking-wide text-white hover:bg-slate-800"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t("signingIn")}
                    </>
                  ) : (
                    t("signIn")
                  )}
                </Button>
              </form>
            </Form>

            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-600">{t("forgotPassword")}</p>

              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm text-slate-600">
                  {t("teamQuestion")}{" "}
                  <Link
                    href="/admin/login"
                    className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                  >
                    {t("adminLink")}
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

export default GuardLoginPage;
