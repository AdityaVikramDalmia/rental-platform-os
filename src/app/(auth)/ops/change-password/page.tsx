"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { changeOpsPassword } from "./actions";
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

const opsChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type OpsChangePasswordValues = z.infer<typeof opsChangePasswordSchema>;

function OpsChangePasswordPage() {
  const router = useRouter();
  const form = useForm<OpsChangePasswordValues>({
    resolver: zodResolver(opsChangePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: OpsChangePasswordValues): Promise<void> {
    const result = await changeOpsPassword(values.currentPassword, values.newPassword);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    router.replace("/ops/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-base text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Rental Platform OS
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Change Password</h1>
        </div>

        <Card className="w-full rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg text-slate-900">Set your new password</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              You must update your temporary password before continuing.
            </CardDescription>
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
                        Current Password
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
                        New Password
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
                        Confirm New Password
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
                      Updating password...
                    </>
                  ) : (
                    "Update Password"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default OpsChangePasswordPage;
