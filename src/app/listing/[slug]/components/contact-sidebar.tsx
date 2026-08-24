"use client";

import Link from "next/link";
import { useState, useTransition, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { Loader2, MessageCircle, Phone, Send, CheckCircle2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { USER_TYPE } from "../../../../../lib/constants";
import { formatINR, paiseToRupees } from "../../../../../lib/money";
import { InquiryForm } from "@/components/tenant/inquiry-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { submitContactFormAction, trackWhatsAppClickAction } from "../actions";

type ContactSidebarProps = {
  listingId: string;
  slug: string;
  rent_monthly: number;
  deposit?: number;
  bhk_config: string;
  society_name: string | null;
  building_name: string | null;
  floor_number: string;
  signInUrl?: string | null;
};

const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().regex(/^\d{10}$/, { message: "Phone must be exactly 10 digits" }),
  message: z.string().optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

function formatCompactINR(paise: number): string {
  const rupees = paiseToRupees(paise);
  if (rupees >= 10000000) return `\u20B9${(rupees / 10000000).toFixed(1)}Cr`;
  if (rupees >= 100000) return `\u20B9${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000) return `\u20B9${Math.round(rupees / 1000)}K`;
  return `\u20B9${Math.round(rupees)}`;
}

export function ContactSidebar({
  listingId,
  slug,
  rent_monthly,
  deposit,
  bhk_config,
  society_name,
  building_name,
  floor_number,
  signInUrl,
}: ContactSidebarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [origin, setOrigin] = useState("");
  const [activeTab, setActiveTab] = useState<"contact" | "visit">("contact");

  useEffect(() => {
    // window.location.origin is unavailable during SSR; sync it post-mount so the
    // server-rendered markup and the client's first hydration pass stay identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const inquiryCount = useQuery(api.listings.getInquiryCountPublic, {
    listing_id: listingId as Id<"listings">,
  });
  const currentUser = useQuery(api.users.getCurrentUser);

  const whatsappPhone = process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE ?? "";
  const contactPhone = process.env.NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE ?? "";

  const listingUrl = `${origin}/listing/${slug}`;

  const societyDisplay = society_name ?? "Property";
  const buildingDisplay = building_name ?? "";

  const whatsappMessage = `Hi, I'm interested in the ${bhk_config} at ${societyDisplay}, ${buildingDisplay}, Floor ${floor_number} (${formatINR(rent_monthly)}/month). Listing: ${listingUrl}`;

  const whatsappUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  const handleWhatsAppClick = useCallback(() => {
    trackWhatsAppClickAction(listingId);
  }, [listingId]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", phone: "", message: "" },
  });

  const onSubmit = (data: ContactFormData) => {
    startTransition(async () => {
      const result = await submitContactFormAction({
        listing_id: listingId,
        name: data.name,
        phone: data.phone,
        message: data.message,
      });
      if (result.success) {
        toast.success("Thanks! We'll be in touch soon.");
        setSubmitted(true);
        setSheetOpen(false);
        reset();
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  };

  const successContent = (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-5 text-center dark:border-emerald-800/50 dark:bg-emerald-950/30">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
        <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
      </div>
      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
        Inquiry submitted successfully!
      </p>
      <p className="mt-1 text-xs text-emerald-600/80 dark:text-emerald-400/80">
        We&apos;ll contact you shortly.
      </p>
    </div>
  );

  const renderForm = (idPrefix: string) => {
    if (submitted) return successContent;

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-name`}>Name</Label>
          <Input
            id={`${idPrefix}-name`}
            placeholder="Your name"
            {...register("name")}
            aria-invalid={!!errors.name}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-phone`}>Phone</Label>
          <Input
            id={`${idPrefix}-phone`}
            placeholder="10-digit phone number"
            inputMode="numeric"
            maxLength={10}
            {...register("phone")}
            aria-invalid={!!errors.phone}
          />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-message`}>
            Message <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id={`${idPrefix}-message`}
            placeholder="Tell us about your requirements..."
            rows={3}
            {...register("message")}
          />
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {isPending ? "Sending..." : "Send Inquiry"}
        </Button>
      </form>
    );
  };

  const renderVisitForm = (idPrefix: string) => {
    if (currentUser === undefined) {
      return (
        <div className="flex items-center justify-center py-8 text-slate-500">
          <Loader2 className="size-5 animate-spin" />
        </div>
      );
    }

    if (!currentUser) {
      const href = signInUrl ?? "/admin/login";
      return (
        <Button asChild className="w-full" size="lg">
          <Link href={href}>Sign in with Google to request a visit</Link>
        </Button>
      );
    }

    if (currentUser.user_type === USER_TYPE.TENANT) {
      return <InquiryForm listingId={listingId as Id<"listings">} />;
    }

    return (
      <p id={`${idPrefix}-visit-non-tenant`} className="text-sm text-slate-600">
        Request visits are available for tenant accounts. Please use WhatsApp or the contact form
        for assistance.
      </p>
    );
  };

  const actionButtons = (
    <div className="flex gap-3">
      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleWhatsAppClick}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#20BD5A]"
        >
          <MessageCircle className="size-4" />
          WhatsApp
        </a>
      )}
      {contactPhone && (
        <a
          href={`tel:+91${contactPhone}`}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Phone className="size-4" />
          Call
        </a>
      )}
    </div>
  );

  const inquiryBadge =
    inquiryCount !== undefined && inquiryCount > 0 ? (
      <p className="text-center text-sm font-medium text-amber-700 dark:text-amber-400">
        {"\uD83D\uDD25"} {inquiryCount} {inquiryCount === 1 ? "person" : "people"} inquired about
        this property
      </p>
    ) : null;

  return (
    <>
      <div className="hidden lg:block">
        <div className="sticky top-24 overflow-hidden rounded-2xl border bg-card shadow-lg">
          <div className="border-b bg-gradient-to-br from-card to-muted/30 px-6 py-5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {formatINR(rent_monthly)}
              </span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
            {deposit !== undefined && deposit > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                Security Deposit: {formatINR(deposit)}
              </p>
            )}
          </div>

          <div className="border-b px-6 py-4">{actionButtons}</div>

          <div className="px-6 py-5">
            <Tabs defaultValue="contact" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="contact" className="flex-1">
                  Contact Us
                </TabsTrigger>
                <TabsTrigger value="visit" className="flex-1">
                  Request Visit
                </TabsTrigger>
              </TabsList>
              <TabsContent value="contact" className="mt-4">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Contact Us
                </h3>
                {renderForm("desktop")}
              </TabsContent>
              <TabsContent value="visit" className="mt-4">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Request Visit
                </h3>
                {renderVisitForm("desktop")}
              </TabsContent>
            </Tabs>
          </div>

          {inquiryBadge && (
            <div className="border-t bg-amber-50/60 px-6 py-3 dark:bg-amber-950/20">
              {inquiryBadge}
            </div>
          )}
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-sm lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <span className="text-lg font-bold tracking-tight text-foreground">
              {formatCompactINR(rent_monthly)}
            </span>
            <span className="text-xs text-muted-foreground">/mo</span>
          </div>

          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleWhatsAppClick}
              className="flex size-10 items-center justify-center rounded-lg bg-[#25D366] text-white transition-colors hover:bg-[#20BD5A]"
              aria-label="Chat on WhatsApp"
            >
              <MessageCircle className="size-5" />
            </a>
          )}
        </div>

        <div className="flex gap-2 px-4 pb-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setActiveTab("contact");
              setSheetOpen(true);
            }}
            className="flex-1"
          >
            Contact Us
          </Button>
          <Button
            type="button"
            onClick={() => {
              setActiveTab("visit");
              setSheetOpen(true);
            }}
            className="flex-1"
          >
            Request Visit
          </Button>
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Contact Us</SheetTitle>
            <SheetDescription>
              Interested in the {bhk_config} at {societyDisplay}? Leave your details.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4 pb-6">
            <div className="rounded-lg bg-muted/50 px-4 py-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-foreground">{formatINR(rent_monthly)}</span>
                <span className="text-xs text-muted-foreground">/month</span>
              </div>
              {deposit !== undefined && deposit > 0 && (
                <p className="text-xs text-muted-foreground">
                  Security Deposit: {formatINR(deposit)}
                </p>
              )}
            </div>

            {actionButtons}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or fill the form</span>
              </div>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value === "visit" ? "visit" : "contact")}
              className="w-full"
            >
              <TabsList className="w-full">
                <TabsTrigger value="contact" className="flex-1">
                  Contact Us
                </TabsTrigger>
                <TabsTrigger value="visit" className="flex-1">
                  Request Visit
                </TabsTrigger>
              </TabsList>
              <TabsContent value="contact" className="mt-4">
                {renderForm("mobile")}
              </TabsContent>
              <TabsContent value="visit" className="mt-4">
                {renderVisitForm("mobile")}
              </TabsContent>
            </Tabs>

            {inquiryBadge}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
