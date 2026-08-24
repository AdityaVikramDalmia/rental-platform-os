"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { submitSupportInquiryAction } from "@/app/(public)/contact/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type SupportInquiryFormData = {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  preferred_contact_method?: string;
  persona_type?: string;
};

export function ContactForm() {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    reset,
  } = useForm<SupportInquiryFormData>({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
      preferred_contact_method: undefined,
      persona_type: undefined,
    },
  });

  useEffect(() => {
    register("preferred_contact_method");
    register("persona_type");
  }, [register]);

  const onSubmit = (data: SupportInquiryFormData) => {
    startTransition(async () => {
      const result = await submitSupportInquiryAction({
        name: data.name.trim(),
        email: data.email.trim(),
        phone: data.phone?.trim() || undefined,
        subject: data.subject.trim(),
        message: data.message.trim(),
        preferred_contact_method: data.preferred_contact_method || undefined,
        persona_type: data.persona_type || undefined,
      });

      if (result.success) {
        toast.success("Thanks! Your message has been received.");
        setSubmitted(true);
        reset();
        return;
      }

      toast.error(result.error ?? "Unable to submit right now. Please try again.");
    });
  };

  if (submitted) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
        <p className="text-sm font-medium text-green-700">
          Inquiry submitted successfully. Our team will contact you soon.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5 rounded-xl border bg-white p-5 sm:p-6"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-name">Name</Label>
          <Input
            id="contact-name"
            placeholder="Your full name"
            {...register("name", {
              required: "Name is required",
              minLength: { value: 2, message: "Name must be at least 2 characters" },
            })}
            aria-invalid={!!errors.name}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            type="email"
            placeholder="you@example.com"
            {...register("email", {
              required: "Email is required",
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: "Please enter a valid email",
              },
            })}
            aria-invalid={!!errors.email}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-phone">Phone (optional)</Label>
          <Input
            id="contact-phone"
            placeholder="10-digit mobile number"
            inputMode="numeric"
            maxLength={10}
            {...register("phone", {
              pattern: {
                value: /^$|^\d{10}$/,
                message: "Phone must be exactly 10 digits",
              },
            })}
            aria-invalid={!!errors.phone}
          />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-subject">Subject</Label>
          <Input
            id="contact-subject"
            placeholder="What do you need help with?"
            {...register("subject", {
              required: "Subject is required",
              minLength: { value: 3, message: "Subject must be at least 3 characters" },
            })}
            aria-invalid={!!errors.subject}
          />
          {errors.subject && <p className="text-sm text-destructive">{errors.subject.message}</p>}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Preferred Contact Method (optional)</Label>
          <Select
            onValueChange={(value) =>
              setValue("preferred_contact_method", value === "NONE" ? undefined : value, {
                shouldDirty: true,
              })
            }
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a contact method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">No preference</SelectItem>
              <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
              <SelectItem value="PHONE">Phone</SelectItem>
              <SelectItem value="EMAIL">Email</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Persona (optional)</Label>
          <Select
            onValueChange={(value) =>
              setValue("persona_type", value === "NONE" ? undefined : value, {
                shouldDirty: true,
              })
            }
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="Who are you?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Prefer not to say</SelectItem>
              <SelectItem value="TENANT">Tenant</SelectItem>
              <SelectItem value="OWNER">Owner</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-message">Message</Label>
        <Textarea
          id="contact-message"
          rows={5}
          placeholder="Please share details so our support team can assist you better."
          {...register("message", {
            required: "Message is required",
            minLength: { value: 10, message: "Message must be at least 10 characters" },
          })}
          aria-invalid={!!errors.message}
        />
        {errors.message && <p className="text-sm text-destructive">{errors.message.message}</p>}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {isPending ? "Submitting..." : "Submit Inquiry"}
      </Button>
    </form>
  );
}
