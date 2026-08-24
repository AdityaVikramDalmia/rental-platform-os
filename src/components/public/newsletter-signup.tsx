"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { subscribeNewsletterAction } from "@/app/(public)/contact/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type NewsletterSignupData = {
  email: string;
};

export function NewsletterSignup({ sourcePage }: { sourcePage: string }) {
  const [isPending, startTransition] = useTransition();
  const [subscribed, setSubscribed] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<NewsletterSignupData>({
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = (data: NewsletterSignupData) => {
    startTransition(async () => {
      const result = await subscribeNewsletterAction({
        email: data.email.trim(),
        source_page: sourcePage,
      });

      if (result.success) {
        toast.success("You're subscribed! We'll share updates soon.");
        setSubscribed(true);
        reset();
        return;
      }

      toast.error(result.error ?? "Unable to subscribe right now. Please try again.");
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-4 space-y-1">
        <p className="text-lg font-semibold text-slate-900">Stay in the loop</p>
        <p className="text-sm text-slate-600">
          Get new listing alerts and rental tips directly in your inbox.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-3 sm:flex sm:items-start sm:gap-3 sm:space-y-0"
      >
        <div className="w-full sm:flex-1">
          <Input
            type="email"
            placeholder="Enter your email"
            disabled={subscribed || isPending}
            {...register("email", {
              required: "Email is required",
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: "Please enter a valid email",
              },
            })}
            aria-invalid={!!errors.email}
          />
          {errors.email && <p className="mt-2 text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <Button type="submit" disabled={subscribed || isPending} className="w-full sm:w-auto">
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : subscribed ? (
            <MailCheck className="size-4" />
          ) : null}
          {subscribed ? "You're subscribed!" : isPending ? "Subscribing..." : "Subscribe"}
        </Button>
      </form>
    </div>
  );
}
