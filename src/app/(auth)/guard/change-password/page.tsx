"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { changeGuardPassword, updateGuardLanguagePreference } from "./actions";
import { api } from "../../../../../convex/_generated/api";
import {
  LANGUAGE_PREFERENCE,
  USER_TYPE,
  type LanguagePreference,
} from "../../../../../lib/constants";
import { LanguageSelector } from "@/components/guard/LanguageSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

function isLanguagePreference(value: string): value is LanguagePreference {
  return Object.values(LANGUAGE_PREFERENCE).includes(value as LanguagePreference);
}

function persistLocale(locale: LanguagePreference): void {
  if (typeof window === "undefined") {
    return;
  }

  document.cookie = `locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  localStorage.setItem("locale", locale);
  localStorage.setItem("hasChosenLanguage", "true");
}

function GuardChangePasswordPage() {
  const t = useTranslations("guard.changePassword");
  const router = useRouter();
  const currentUser = useQuery(api.users.getCurrentUser);
  const guardChangePasswordSchema = z
    .object({
      currentPassword: z.string().min(1, t("currentRequired")),
      newPassword: z.string().min(8, t("tooShort")),
      confirmPassword: z.string().min(1, t("confirmRequired")),
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
      message: t("mismatch"),
      path: ["confirmPassword"],
    });

  type GuardChangePasswordValues = z.infer<typeof guardChangePasswordSchema>;

  const form = useForm<GuardChangePasswordValues>({
    resolver: zodResolver(guardChangePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });
  const [isLanguageUpdating, setIsLanguageUpdating] = useState(false);
  const [isLanguagePromptOpen, setIsLanguagePromptOpen] = useState(false);
  const [currentLocale, setCurrentLocale] = useState<string>(LANGUAGE_PREFERENCE.en);

  const isSubmitting = form.formState.isSubmitting;

  async function applyLanguageAndContinue(locale: string): Promise<void> {
    if (!isLanguagePreference(locale)) {
      return;
    }

    setCurrentLocale(locale);
    setIsLanguageUpdating(true);

    const result = await updateGuardLanguagePreference(locale);

    if ("error" in result) {
      toast.error(result.error);
      setIsLanguageUpdating(false);
      return;
    }

    persistLocale(locale);
    router.replace("/guard/dashboard");
  }

  async function onSubmit(values: GuardChangePasswordValues): Promise<void> {
    const result = await changeGuardPassword(values.currentPassword, values.newPassword);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    if (typeof window === "undefined") {
      router.replace("/guard/dashboard");
      return;
    }

    if (currentUser?.user_type === USER_TYPE.OPS) {
      router.replace("/guard/dashboard");
      return;
    }

    const hasChosenLanguage = window.localStorage.getItem("hasChosenLanguage") === "true";
    const savedLocale = window.localStorage.getItem("locale");
    const localeCandidate = savedLocale ?? "";
    const locale: LanguagePreference = isLanguagePreference(localeCandidate)
      ? localeCandidate
      : LANGUAGE_PREFERENCE.en;
    setCurrentLocale(locale);

    if (hasChosenLanguage) {
      persistLocale(locale);
      router.replace("/guard/dashboard");
      return;
    }

    setIsLanguagePromptOpen(true);
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-base text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            {t("brandName")}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("title")}</h1>
        </div>

        <Card className="w-full rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg text-slate-900">{t("subtitle")}</CardTitle>
            <CardDescription className="text-sm text-slate-600">{t("description")}</CardDescription>
          </CardHeader>

          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
                <input
                  type="text"
                  autoComplete="username"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                />

                <FormField
                  control={form.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-800">
                        {t("currentPassword")}
                      </FormLabel>
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

                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-800">
                        {t("newPassword")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          autoComplete="new-password"
                          className="h-11 min-h-11 rounded-lg border-slate-300 text-base"
                        />
                      </FormControl>
                      <FormMessage className="text-red-600" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-800">
                        {t("confirmPassword")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          autoComplete="new-password"
                          className="h-11 min-h-11 rounded-lg border-slate-300 text-base"
                        />
                      </FormControl>
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
                      {t("updating")}
                    </>
                  ) : (
                    t("submit")
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={isLanguagePromptOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsLanguagePromptOpen(true);
            return;
          }

          if (!isLanguageUpdating) {
            void applyLanguageAndContinue(LANGUAGE_PREFERENCE.en);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose your language / अपनी भाषा चुनें</DialogTitle>
            <DialogDescription>
              Select your preferred language before going to dashboard.
            </DialogDescription>
          </DialogHeader>

          <LanguageSelector
            currentLocale={currentLocale}
            onSelect={(locale) => {
              void applyLanguageAndContinue(locale);
            }}
            disabled={isLanguageUpdating}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void applyLanguageAndContinue(LANGUAGE_PREFERENCE.en);
              }}
              disabled={isLanguageUpdating}
            >
              Skip for now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GuardChangePasswordPage;
