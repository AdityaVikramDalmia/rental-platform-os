"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "convex/react";
import { Check, Copy, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
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

function stripToDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  return digits;
}

const opsFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z
    .string()
    .transform(stripToDigits)
    .pipe(z.string().regex(/^\d{10}$/, "Must be exactly 10 digits")),
  google_email: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Enter a valid email"),
  temp_password: z.string().min(8, "Minimum 8 characters"),
});

type OpsFormValues = z.infer<typeof opsFormSchema>;

type OpsCreateDialogProps = {
  open: boolean;
  action: (open: boolean) => void;
};

type CreatedCredentials = {
  phone: string;
  tempPassword: string;
  googleEmail?: string;
};

export function OpsCreateDialog({ open, action }: OpsCreateDialogProps) {
  const createOpsAccount = useAction(api.actions.workos.createOpsAccount);

  const [step, setStep] = useState<"form" | "credentials">("form");
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const form = useForm<OpsFormValues>({
    resolver: zodResolver(opsFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      google_email: "",
      temp_password: "",
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
      form.reset({
        name: "",
        phone: "",
        google_email: "",
        temp_password: "",
      });
      setStep("form");
      setCredentials(null);
      setShowPassword(false);
      setCopied(false);
    }
  }

  const handleDialogClose = useCallback(
    (nextOpen: boolean) => {
      action(nextOpen);

      if (!nextOpen) {
        setStep("form");
        setCredentials(null);
        setShowPassword(false);
        setCopied(false);
        form.reset();
      }
    },
    [action, form],
  );

  async function onSubmit(values: OpsFormValues) {
    try {
      const googleEmail = values.google_email?.trim() || undefined;

      await createOpsAccount({
        name: values.name.trim(),
        phone: values.phone,
        temp_password: values.temp_password,
        google_email: googleEmail,
      });

      setCredentials({
        phone: values.phone,
        tempPassword: values.temp_password,
        googleEmail,
      });
      setStep("credentials");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create OPS account";
      toast.error(message);
    }
  }

  async function copyPassword() {
    if (!credentials) {
      return;
    }

    try {
      await navigator.clipboard.writeText(credentials.tempPassword);
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
              <DialogTitle>Add OPS User</DialogTitle>
              <DialogDescription>
                If Google email is provided, the user signs in with Google SSO only. Without Google
                email, the user signs in with phone number and password.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="OPS user's full name"
                          className="h-10 border-slate-300"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          inputMode="numeric"
                          placeholder="10-digit mobile number"
                          className="h-10 border-slate-300"
                          onChange={(event) => {
                            field.onChange(stripToDigits(event.target.value));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="google_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Google Email (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          type="email"
                          placeholder="admin@example.com"
                          className="h-10 border-slate-300"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="temp_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Temporary Password</FormLabel>
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
                        Creating...
                      </>
                    ) : (
                      "Create OPS User"
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
                <ShieldCheck className="size-6 text-emerald-600" />
              </div>
              <DialogTitle className="text-center">OPS User Created Successfully!</DialogTitle>
              <DialogDescription className="text-center">
                Share these credentials. With Google email, the user signs in via Google SSO only.
                Without Google email, the user signs in with phone number and password.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Username
                </p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                  {credentials?.phone}
                </p>
              </div>

              {credentials?.googleEmail ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Google Email
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                    {credentials.googleEmail}
                  </p>
                </div>
              ) : null}

              {credentials?.googleEmail ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-sm font-medium text-emerald-800">
                    This user will sign in with Google SSO. No password needed.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Temporary Password
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="font-mono text-sm font-semibold text-slate-900">
                      {showPassword
                        ? credentials?.tempPassword
                        : "\u2022".repeat(credentials?.tempPassword.length ?? 8)}
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
              )}
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
