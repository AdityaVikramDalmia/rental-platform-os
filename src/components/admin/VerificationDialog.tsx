"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Loader2, Phone } from "lucide-react";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import { CALL_OUTCOME } from "../../../lib/constants";
import { formatPhoneDisplay } from "../../../lib/validators";
import type { VerificationLead } from "@/components/admin/VerificationTable";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

const OUTCOME_VALUES = [
  CALL_OUTCOME.VERIFIED,
  CALL_OUTCOME.UNREACHABLE,
  CALL_OUTCOME.DECLINED,
  CALL_OUTCOME.FALSE,
] as const;

const verificationDialogSchema = z.object({
  call_outcome: z.enum(OUTCOME_VALUES, {
    message: "Call outcome is required.",
  }),
  consent_contact_demorentals: z.boolean(),
  consent_visit_coordination: z.boolean(),
  preferred_visit_slots: z.string().optional(),
  rent_confirmed: z.string().optional(),
  notes: z.string().optional(),
});

type VerificationDialogValues = z.infer<typeof verificationDialogSchema>;

type VerificationDialogProps = {
  isOpen: boolean;
  setOpenAction: (open: boolean) => void;
  lead: VerificationLead;
};

export function VerificationDialog({ isOpen, setOpenAction, lead }: VerificationDialogProps) {
  const createVerification = useMutation(api.verifications.create);

  const form = useForm<VerificationDialogValues>({
    resolver: zodResolver(verificationDialogSchema),
    defaultValues: {
      consent_contact_demorentals: false,
      consent_visit_coordination: false,
      preferred_visit_slots: "",
      rent_confirmed: "",
      notes: "",
    },
  });

  const callOutcome = useWatch({ control: form.control, name: "call_outcome" });
  const consentContactDemoRentals = useWatch({
    control: form.control,
    name: "consent_contact_demorentals",
  });
  const isVerifiedOutcome = callOutcome === CALL_OUTCOME.VERIFIED;
  const isBlockedByMissingConsent = isVerifiedOutcome && !consentContactDemoRentals;
  const isSubmitting = form.formState.isSubmitting;

  useEffect(() => {
    if (!isOpen) {
      form.reset({
        consent_contact_demorentals: false,
        consent_visit_coordination: false,
        preferred_visit_slots: "",
        rent_confirmed: "",
        notes: "",
      });
    }
  }, [form, isOpen]);

  useEffect(() => {
    if (!isVerifiedOutcome) {
      form.setValue("consent_contact_demorentals", false);
      form.setValue("consent_visit_coordination", false);
      form.setValue("preferred_visit_slots", "");
      form.setValue("rent_confirmed", "");
    }
  }, [form, isVerifiedOutcome]);

  useEffect(() => {
    if (!consentContactDemoRentals) {
      form.setValue("consent_visit_coordination", false);
    }
  }, [consentContactDemoRentals, form]);

  async function onSubmit(values: VerificationDialogValues) {
    try {
      const trimmedRentValue = values.rent_confirmed?.trim();
      const parsedRent = trimmedRentValue ? Number(trimmedRentValue) : undefined;
      const rentConfirmedPaise =
        parsedRent !== undefined && Number.isFinite(parsedRent)
          ? Math.round(parsedRent * 100)
          : undefined;

      await createVerification({
        lead_id: lead._id,
        call_outcome: values.call_outcome,
        consent_contact_demorentals: isVerifiedOutcome ? values.consent_contact_demorentals : false,
        consent_visit_coordination:
          isVerifiedOutcome && values.consent_contact_demorentals
            ? values.consent_visit_coordination
            : undefined,
        preferred_visit_slots:
          isVerifiedOutcome && values.preferred_visit_slots?.trim()
            ? values.preferred_visit_slots.trim()
            : undefined,
        rent_confirmed: isVerifiedOutcome ? rentConfirmedPaise : undefined,
        notes: values.notes?.trim() ? values.notes.trim() : undefined,
      });

      toast.success("Verification recorded");
      form.reset({
        consent_contact_demorentals: false,
        consent_visit_coordination: false,
        preferred_visit_slots: "",
        rent_confirmed: "",
        notes: "",
      });
      setOpenAction(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to record verification";
      toast.error(message);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpenAction}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Verify Lead - {lead.building_name ?? "Building"} {lead.flat_number}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <a
            href={`tel:+91${lead.owner_phone}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline"
          >
            <Phone className="size-4" />
            {formatPhoneDisplay(lead.owner_phone)}
          </a>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="call_outcome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Call Outcome</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-medium">
                          <RadioGroupItem value={CALL_OUTCOME.VERIFIED} />
                          Verified
                        </Label>
                        <Label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-medium">
                          <RadioGroupItem value={CALL_OUTCOME.UNREACHABLE} />
                          Unreachable
                        </Label>
                        <Label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-medium">
                          <RadioGroupItem value={CALL_OUTCOME.DECLINED} />
                          Declined
                        </Label>
                        <Label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-medium">
                          <RadioGroupItem value={CALL_OUTCOME.FALSE} />
                          False / Wrong Info
                        </Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isVerifiedOutcome ? (
              <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <FormField
                  control={form.control}
                  name="consent_contact_demorentals"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(checked) => field.onChange(checked === true)}
                          />
                        </FormControl>
                        <FormLabel className="text-sm font-medium">
                          Owner Consents to DemoRentals Contact
                        </FormLabel>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {consentContactDemoRentals ? (
                  <FormField
                    control={form.control}
                    name="consent_visit_coordination"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => field.onChange(checked === true)}
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-medium">
                            Owner Consents to Visit Coordination
                          </FormLabel>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}

                <FormField
                  control={form.control}
                  name="preferred_visit_slots"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Visit Slots</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Weekdays 10am-4pm" />
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
                      <FormLabel>Rent Confirmed (INR)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="0"
                          step="1"
                          placeholder="e.g., 25000"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={4}
                      placeholder="Any additional details from the call..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isBlockedByMissingConsent ? (
              <p className="text-sm font-medium text-red-600">
                Owner consent is required to verify this lead.
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenAction(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isBlockedByMissingConsent}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Verification"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
