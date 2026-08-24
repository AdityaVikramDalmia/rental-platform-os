"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { USER_TYPE } from "../../../lib/constants";
import { Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const visitInquirySchema = z.object({
  preferred_visit_date: z.string().optional(),
  preferred_visit_slot: z.string().optional(),
  message: z.string().max(1200, "Message must be 1200 characters or less").optional(),
});

const TIME_SLOT_OPTIONS = [
  "Morning 9-12",
  "Afternoon 12-3",
  "Evening 3-6",
  "Late Evening 6-9",
] as const;

type VisitInquiryValues = z.infer<typeof visitInquirySchema>;

type InquiryFormProps = {
  listingId: Id<"listings">;
  onSuccessAction?: () => void;
};

function isRateLimitError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("rate") || normalized.includes("too many");
}

export function InquiryForm({ listingId, onSuccessAction }: InquiryFormProps) {
  const currentUser = useQuery(api.users.getCurrentUser);
  const submitInquiry = useMutation(api.tenantInquiries.submit);
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<VisitInquiryValues>({
    resolver: zodResolver(visitInquirySchema),
    defaultValues: {
      preferred_visit_date: "",
      preferred_visit_slot: "",
      message: "",
    },
  });

  async function onSubmit(values: VisitInquiryValues) {
    if (!currentUser || currentUser.user_type !== USER_TYPE.TENANT) {
      toast.error("Tenant sign in is required.");
      return;
    }

    const normalizedPhone = currentUser.phone?.replace(/\D/g, "") ?? "";
    if (normalizedPhone.length !== 10) {
      toast.error("Your tenant profile must have a valid 10-digit phone number.");
      return;
    }

    const normalizedName = currentUser.name.trim();
    if (normalizedName.length < 2) {
      toast.error("Your tenant profile must have a valid name.");
      return;
    }

    try {
      await submitInquiry({
        listing_id: listingId,
        preferred_visit_date: values.preferred_visit_date
          ? new Date(`${values.preferred_visit_date}T00:00:00`).getTime()
          : undefined,
        preferred_visit_slot: values.preferred_visit_slot || undefined,
        message: values.message?.trim() || undefined,
      });

      setSubmitted(true);
      toast.success("Visit request submitted! Our team will review and get back to you.");
      onSuccessAction?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit visit request";
      if (isRateLimitError(message)) {
        toast.error("Too many requests. Please try again later.");
        return;
      }
      toast.error(message);
    }
  }

  if (currentUser === undefined) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-500">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <Button asChild className="w-full" size="lg">
        <Link href="/admin/login">
          <LogIn className="size-4" />
          Sign in to request a visit
        </Link>
      </Button>
    );
  }

  if (currentUser.user_type !== USER_TYPE.TENANT) {
    return (
      <p className="text-sm text-slate-600">
        Visit requests are available for tenant accounts. Use the contact form for assistance.
      </p>
    );
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
        Visit request submitted! Our team will review and get back to you.
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="preferred_visit_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preferred Date</FormLabel>
              <FormControl>
                <DatePicker
                  value={field.value}
                  onChange={field.onChange}
                  minDate={new Date().toISOString().split("T")[0]}
                  placeholder="Pick preferred date"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="preferred_visit_slot"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preferred Time Slot</FormLabel>
              <FormControl>
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time slot" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOT_OPTIONS.map((slot) => (
                      <SelectItem key={slot} value={slot}>
                        {slot}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message (optional)</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="Share your move-in timeline or requirements..."
                  value={field.value ?? ""}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Submitting...
            </>
          ) : (
            "Request Visit"
          )}
        </Button>
      </form>
    </Form>
  );
}
