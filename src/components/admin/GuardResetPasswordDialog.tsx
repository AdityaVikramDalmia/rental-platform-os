"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "convex/react";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
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

const resetPasswordSchema = z.object({
  new_temp_password: z.string().min(8, "Minimum 8 characters"),
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

type GuardResetPasswordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guard: {
    user_id: Id<"users">;
    workos_user_id: string;
    name: string;
    phone: string | undefined;
  };
};

export function GuardResetPasswordDialog({
  open,
  onOpenChange,
  guard,
}: GuardResetPasswordDialogProps) {
  const resetGuardPassword = useAction(api.actions.workos.resetGuardPassword);

  const [step, setStep] = useState<"form" | "credentials">("form");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      new_temp_password: "",
    },
  });

  // Reset the dialog's local state whenever it opens, mirroring the previous effect's
  // dependency array. Adjusting state during render (rather than in an effect) avoids a
  // stale-content flash between the dialog opening and an effect resetting it. See
  // "Adjusting state when a prop changes": https://react.dev/learn/you-might-not-need-an-effect
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      form.reset({ new_temp_password: "" });
      setStep("form");
      setNewPassword("");
      setShowPassword(false);
      setCopied(false);
    }
  }

  const handleDialogClose = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);

      if (!nextOpen) {
        setStep("form");
        setNewPassword("");
        setShowPassword(false);
        setCopied(false);
        form.reset();
      }
    },
    [onOpenChange, form],
  );

  async function onSubmit(values: ResetPasswordFormValues) {
    try {
      await resetGuardPassword({
        workos_user_id: guard.workos_user_id,
        user_id: guard.user_id,
        new_temp_password: values.new_temp_password,
      });

      setNewPassword(values.new_temp_password);
      setStep("credentials");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reset password";
      toast.error(message);
    }
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopied(true);
      toast.success("Copied!");

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-xl">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Set a new temporary password for{" "}
                <span className="font-medium text-slate-700">{guard.name}</span>. They will be
                required to change it on next login.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <FormField
                  control={form.control}
                  name="new_temp_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Temporary Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="Min. 8 characters"
                          className="h-10 border-slate-300"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      "Reset Password"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-emerald-100">
                <KeyRound className="size-6 text-emerald-600" />
              </div>
              <DialogTitle className="text-center">Password Reset Successfully!</DialogTitle>
              <DialogDescription className="text-center">
                Share these updated credentials with the guard. They will be required to change
                their password on next login.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Username
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                  {guard.phone ?? "\u2014"}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  New Password
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="font-mono text-sm font-semibold text-slate-900">
                    {showPassword ? newPassword : "\u2022".repeat(newPassword.length || 8)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={copyPassword}
                    className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                    aria-label="Copy password"
                  >
                    {copied ? (
                      <Check className="size-4 text-emerald-500" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                className="w-full bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => handleDialogClose(false)}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
