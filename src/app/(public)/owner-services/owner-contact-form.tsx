"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { normalizePhone } from "../../../../lib/validators";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const propertyTypes = [
  { label: "1 BHK", value: "1BHK" },
  { label: "2 BHK", value: "2BHK" },
  { label: "3 BHK", value: "3BHK" },
  { label: "Villa / Independent House", value: "VILLA" },
  { label: "Other", value: "OTHER" },
] as const;

const ownerContactSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  phone: z
    .string()
    .trim()
    .min(1, "Mobile number is required")
    .refine(
      (value) => {
        try {
          normalizePhone(value);
          return true;
        } catch {
          return false;
        }
      },
      {
        message: "Enter a valid 10-digit Indian mobile number",
      },
    ),
  email: z.string().trim().email("Invalid email address").optional().or(z.literal("")),
  property_type: z.string().optional(),
  location: z.string().trim().max(120, "Location is too long").optional().or(z.literal("")),
  property_value: z
    .string()
    .optional()
    .refine((value) => !value || (Number.isFinite(Number(value)) && Number(value) > 0), {
      message: "Property value must be a positive number",
    }),
  notes: z
    .string()
    .trim()
    .max(500, "Notes cannot exceed 500 characters")
    .optional()
    .or(z.literal("")),
});

export type OwnerContactFormValues = z.infer<typeof ownerContactSchema>;

type OwnerContactFormProps = {
  onSubmit: (values: OwnerContactFormValues) => Promise<boolean>;
  isSubmitting: boolean;
};

export function OwnerContactForm({ onSubmit, isSubmitting }: OwnerContactFormProps) {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<OwnerContactFormValues>({
    resolver: zodResolver(ownerContactSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      property_type: undefined,
      location: "",
      property_value: "",
      notes: "",
    },
  });

  async function handleSubmit(values: OwnerContactFormValues) {
    const success = await onSubmit(values);
    if (success) {
      setSubmitted(true);
      form.reset();
    }
  }

  const submitPending = isSubmitting || form.formState.isSubmitting;

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="size-7 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">Request Submitted</h3>
        <p className="mt-1 max-w-xs text-sm text-slate-600">
          Thank you — our property management team will reach out within 24 hours.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Send className="size-3.5" />
          Send Another Request
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-slate-900">Property Details</h3>
        <p className="mt-0.5 text-sm text-slate-600">
          Fill in your details and we&apos;ll get back to you within 24 hours.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" noValidate>
          {/* Row 1: Name + Phone */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Full Name <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Rajesh Kumar" {...field} />
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
                  <FormLabel>
                    Mobile Number <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="tel"
                      placeholder="9876543210"
                      maxLength={14}
                      onChange={(event) => {
                        field.onChange(event.target.value.replace(/[^\d+\s()-]/g, ""));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Row 2: Email + Property Type */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="rajesh@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="property_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property Type</FormLabel>
                  <Select
                    onValueChange={(value) =>
                      field.onChange(value === "UNSPECIFIED" ? undefined : value)
                    }
                    value={field.value ?? "UNSPECIFIED"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select property type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="UNSPECIFIED">Not sure yet</SelectItem>
                      {propertyTypes.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Row 3: Location + Property Value */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property Location</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Society / Area (e.g. Maplewood Gardens)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="property_value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated Value (&#x20B9;)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="e.g. 5000000"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Full width: Notes */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Additional Notes</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Tell us about your property, current tenancy status, or any specific requirements..."
                    rows={3}
                    className="resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Submit */}
          <Button
            type="submit"
            className="w-full bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            disabled={submitPending}
          >
            {submitPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Request"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
