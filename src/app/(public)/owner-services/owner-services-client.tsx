"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import { rupeesToPaise } from "../../../../lib/money";
import { normalizePhone } from "../../../../lib/validators";
import { ConvexClientProvider } from "@/components/shared/ConvexClientProvider";
import { OwnerContactForm, type OwnerContactFormValues } from "./owner-contact-form";

function OwnerServicesForm() {
  const submitOwnerServiceRequest = useMutation(api.ownerServiceRequests.submit);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: OwnerContactFormValues): Promise<boolean> => {
    setIsSubmitting(true);

    try {
      await submitOwnerServiceRequest({
        name: values.name.trim(),
        phone: normalizePhone(values.phone),
        email: values.email?.trim() || undefined,
        property_type: values.property_type || undefined,
        location: values.location?.trim() || undefined,
        property_value: values.property_value
          ? rupeesToPaise(Number(values.property_value))
          : undefined,
        notes: values.notes?.trim() || undefined,
      });

      toast.success("Thank you! Our team will contact you within 24 hours.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit request";
      const lower = message.toLowerCase();

      if (
        lower.includes("rate limit") ||
        lower.includes("too many requests") ||
        lower.includes("retry after")
      ) {
        toast.error("Too many requests. Please try again later.");
      } else {
        toast.error(message);
      }

      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return <OwnerContactForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />;
}

export function OwnerServicesClient() {
  return (
    <ConvexClientProvider>
      <OwnerServicesForm />
    </ConvexClientProvider>
  );
}
