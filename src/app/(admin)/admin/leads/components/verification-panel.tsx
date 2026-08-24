"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { CheckCircle2, Loader2, Phone, PhoneCall } from "lucide-react";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { CALL_OUTCOME } from "../../../../../../lib/constants";
import { rupeesToPaise } from "../../../../../../lib/money";
import { formatPhoneDisplay } from "../../../../../../lib/validators";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const OUTCOME_OPTIONS = [
  {
    value: CALL_OUTCOME.VERIFIED,
    label: "Verified",
    color: "border-emerald-400 bg-emerald-50 text-emerald-800",
  },
  {
    value: CALL_OUTCOME.UNREACHABLE,
    label: "Unreachable",
    color: "border-amber-400 bg-amber-50 text-amber-800",
  },
  {
    value: CALL_OUTCOME.DECLINED,
    label: "Owner Declined",
    color: "border-red-400 bg-red-50 text-red-800",
  },
  {
    value: CALL_OUTCOME.FALSE,
    label: "False / Wrong Info",
    color: "border-red-400 bg-red-50 text-red-800",
  },
] as const;

const verificationSchema = z.object({
  call_outcome: z.enum([
    CALL_OUTCOME.VERIFIED,
    CALL_OUTCOME.UNREACHABLE,
    CALL_OUTCOME.DECLINED,
    CALL_OUTCOME.FALSE,
  ]),
  consent_contact_demorentals: z.boolean(),
  consent_visit_coordination: z.boolean().optional(),
  preferred_visit_slots: z.string().optional(),
  rent_confirmed: z.string().optional(),
  notes: z.string().optional(),
});

type VerificationValues = z.infer<typeof verificationSchema>;

type VerificationPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: Id<"leads">;
  ownerName?: string;
  ownerPhone: string;
};

export function VerificationPanel({
  open,
  onOpenChange,
  leadId,
  ownerName,
  ownerPhone,
}: VerificationPanelProps) {
  const createVerification = useMutation(api.verifications.create);

  const form = useForm<VerificationValues>({
    resolver: zodResolver(verificationSchema),
    defaultValues: {
      call_outcome: CALL_OUTCOME.VERIFIED,
      consent_contact_demorentals: false,
      consent_visit_coordination: false,
      preferred_visit_slots: "",
      rent_confirmed: "",
      notes: "",
    },
  });

  const callOutcome = useWatch({ control: form.control, name: "call_outcome" });
  const consentContact = useWatch({ control: form.control, name: "consent_contact_demorentals" });
  const isVerifiedOutcome = callOutcome === CALL_OUTCOME.VERIFIED;

  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [form, open]);

  useEffect(() => {
    if (!isVerifiedOutcome) {
      form.setValue("consent_contact_demorentals", false);
      form.setValue("consent_visit_coordination", false);
    }
  }, [form, isVerifiedOutcome]);

  useEffect(() => {
    if (!consentContact) {
      form.setValue("consent_visit_coordination", false);
    }
  }, [form, consentContact]);

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: VerificationValues) {
    try {
      const rentPaise =
        values.rent_confirmed && values.rent_confirmed.trim()
          ? rupeesToPaise(Number(values.rent_confirmed))
          : undefined;

      await createVerification({
        lead_id: leadId,
        call_outcome: values.call_outcome,
        consent_contact_demorentals: isVerifiedOutcome ? values.consent_contact_demorentals : false,
        consent_visit_coordination:
          isVerifiedOutcome && values.consent_contact_demorentals
            ? values.consent_visit_coordination
            : undefined,
        preferred_visit_slots: values.preferred_visit_slots?.trim() || undefined,
        rent_confirmed: rentPaise,
        notes: values.notes?.trim() || undefined,
      });

      toast.success("Verification recorded");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record verification");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-lg">Call &amp; Verify</SheetTitle>
          <SheetDescription>Record owner verification call outcome.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-slate-900">{ownerName ?? "Owner"}</p>
                <a
                  href={`tel:+91${ownerPhone}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
                >
                  <Phone className="size-3.5" />
                  {formatPhoneDisplay(ownerPhone)}
                </a>
              </div>
              <a
                href={`tel:+91${ownerPhone}`}
                className="flex size-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 transition-colors hover:bg-indigo-200"
                aria-label="Call owner"
              >
                <PhoneCall className="size-4" />
              </a>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <FormField
                control={form.control}
                name="call_outcome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Call Outcome</FormLabel>
                    <FormControl>
                      <RadioGroup value={field.value} onValueChange={field.onChange}>
                        <div className="grid grid-cols-2 gap-2">
                          {OUTCOME_OPTIONS.map((opt) => {
                            const isSelected = field.value === opt.value;
                            return (
                              <label
                                key={opt.value}
                                className={`flex cursor-pointer items-center justify-center rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                                  isSelected
                                    ? opt.color
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                }`}
                              >
                                <RadioGroupItem value={opt.value} className="sr-only" />
                                {isSelected && <CheckCircle2 className="mr-1.5 size-3.5" />}
                                {opt.label}
                              </label>
                            );
                          })}
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isVerifiedOutcome && (
                <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Consent
                  </p>

                  <FormField
                    control={form.control}
                    name="consent_contact_demorentals"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex cursor-pointer items-start gap-2.5">
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="mt-0.5"
                          />
                          <span className="text-sm text-slate-800">
                            Owner consents to DemoRentals contact
                            <span className="ml-1 text-xs text-red-500">*</span>
                          </span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {consentContact && (
                    <FormField
                      control={form.control}
                      name="consent_visit_coordination"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex cursor-pointer items-start gap-2.5">
                            <Checkbox
                              checked={field.value ?? false}
                              onCheckedChange={field.onChange}
                              className="mt-0.5"
                            />
                            <span className="text-sm text-slate-800">
                              Owner consents to visit coordination
                            </span>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}

              <FormField
                control={form.control}
                name="preferred_visit_slots"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferred Visit Slots</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Weekdays 10am-1pm"
                        className="h-9 border-slate-300"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rent_confirmed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rent Confirmed (&#8377;)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min="0"
                        step="1"
                        placeholder="e.g., 25000"
                        className="h-9 border-slate-300"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <textarea
                        {...field}
                        rows={3}
                        placeholder="Any additional notes from the call..."
                        className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Verification"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
