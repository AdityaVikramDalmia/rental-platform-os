"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction, useQuery } from "convex/react";
import { Check, Copy, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
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
import { GUARD_TYPE } from "../../../lib/constants";

const GUARD_TYPE_LABELS: Record<string, string> = {
  [GUARD_TYPE.BUILDING_SPECIFIC]: "Building Guard",
  [GUARD_TYPE.MAIN_GATE]: "Main Gate Guard",
  [GUARD_TYPE.PARK]: "Park Guard",
  [GUARD_TYPE.ROVING]: "Roving Guard",
};

function stripToDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  return digits;
}

const guardFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z
    .string()
    .transform(stripToDigits)
    .pipe(z.string().regex(/^\d{10}$/, "Must be exactly 10 digits")),
  society_id: z.string().min(1, "Society is required"),
  guard_type: z.enum([
    GUARD_TYPE.BUILDING_SPECIFIC,
    GUARD_TYPE.MAIN_GATE,
    GUARD_TYPE.PARK,
    GUARD_TYPE.ROVING,
  ]),
  temp_password: z.string().min(8, "Minimum 8 characters"),
  referrer_phone: z
    .string()
    .transform((val) => (val ? stripToDigits(val) : ""))
    .pipe(
      z.string().refine((val) => val === "" || /^\d{10}$/.test(val), "Must be exactly 10 digits"),
    ),
});

type GuardFormValues = z.infer<typeof guardFormSchema>;

type GuardCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSocietyId?: string;
};

type CreatedCredentials = {
  phone: string;
  tempPassword: string;
};

export function GuardCreateDialog({
  open,
  onOpenChange,
  defaultSocietyId,
}: GuardCreateDialogProps) {
  const createGuardAccount = useAction(api.actions.workos.createGuardAccount);
  const societies = useQuery(api.societies.list, {});

  const [step, setStep] = useState<"form" | "credentials">("form");
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const form = useForm<GuardFormValues>({
    resolver: zodResolver(guardFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      society_id: defaultSocietyId ?? "",
      guard_type: GUARD_TYPE.BUILDING_SPECIFIC,
      temp_password: "",
      referrer_phone: "",
    },
  });

  // Reset the dialog's local state whenever it opens (or the default society changes
  // while open), mirroring the previous effect's dependency array. Adjusting state
  // during render (rather than in an effect) avoids a stale-content flash between the
  // dialog opening and an effect resetting it. See "Adjusting state when a prop
  // changes": https://react.dev/learn/you-might-not-need-an-effect
  const [resetTrigger, setResetTrigger] = useState({ open, defaultSocietyId });
  if (open !== resetTrigger.open || defaultSocietyId !== resetTrigger.defaultSocietyId) {
    setResetTrigger({ open, defaultSocietyId });
    if (open) {
      form.reset({
        name: "",
        phone: "",
        society_id: defaultSocietyId ?? "",
        guard_type: GUARD_TYPE.BUILDING_SPECIFIC,
        temp_password: "",
        referrer_phone: "",
      });
      setStep("form");
      setCredentials(null);
      setShowPassword(false);
      setCopied(false);
    }
  }

  const handleDialogClose = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);

      if (!nextOpen) {
        setStep("form");
        setCredentials(null);
        setShowPassword(false);
        setCopied(false);
        form.reset();
      }
    },
    [onOpenChange, form],
  );

  async function onSubmit(values: GuardFormValues) {
    try {
      await createGuardAccount({
        name: values.name.trim(),
        phone: values.phone,
        society_id: values.society_id as Id<"societies">,
        guard_type: values.guard_type,
        temp_password: values.temp_password,
        referrer_phone: values.referrer_phone || undefined,
      });

      setCredentials({
        phone: values.phone,
        tempPassword: values.temp_password,
      });
      setStep("credentials");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create guard account";
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
              <DialogTitle>Add Guard</DialogTitle>
              <DialogDescription>
                Create a new guard account with WorkOS credentials.
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
                          placeholder="Guard's full name"
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
                  name="society_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Society</FormLabel>
                      <FormControl>
                        <select
                          value={field.value}
                          onChange={(event) => field.onChange(event.target.value)}
                          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                        >
                          <option value="">Select a society</option>
                          {(societies ?? []).map((society) => (
                            <option key={society._id} value={society._id}>
                              {society.name}, {society.city}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="guard_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guard Type</FormLabel>
                      <FormControl>
                        <select
                          value={field.value}
                          onChange={(event) => field.onChange(event.target.value)}
                          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                        >
                          {Object.entries(GUARD_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
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

                <FormField
                  control={form.control}
                  name="referrer_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Referrer Phone (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          inputMode="numeric"
                          placeholder="Referring guard's 10-digit number"
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
                      "Create Guard"
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
              <DialogTitle className="text-center">Guard Created Successfully!</DialogTitle>
              <DialogDescription className="text-center">
                Share these credentials with the guard. They will be required to change their
                password on first login.
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
