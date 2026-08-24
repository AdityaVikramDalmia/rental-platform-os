import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, MapPin, MessageCircle } from "lucide-react";
import { faqCategories, faqData } from "./data/faq-contact";
import { ContactForm } from "@/components/public/contact-form";
import { ContactMethodsGrid } from "@/components/public/contact-methods-grid";
import { FaqSection } from "@/components/public/faq-section";
import { NewsletterSignup } from "@/components/public/newsletter-signup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with DemoRentals for rental support, listing help, account assistance, and general inquiries.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact Us - DemoRentals",
    description:
      "Get in touch with DemoRentals for rental support, listing help, account assistance, and general inquiries.",
    type: "website",
    url: "/contact",
  },
};

export default function ContactPage() {
  const whatsappPhone = process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE ?? "";
  const whatsappMessage = "Hi DemoRentals team, I need support with rentals.";
  const whatsappHref = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  return (
    <div>
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 py-12 text-white lg:py-20">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold sm:text-4xl">Get in touch</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-200 sm:text-lg">
            Need help with listings, visits, account issues, or billing? Reach out and we will help
            you quickly.
          </p>
          <div className="mt-7 flex justify-center">
            {whatsappHref ? (
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700">
                  <MessageCircle className="size-4" />
                  Chat on WhatsApp
                </Button>
              </a>
            ) : (
              <Button asChild size="lg">
                <Link href="/homepage">Back to Homepage</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white py-12 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Contact methods</h2>
            <p className="mt-2 text-muted-foreground">
              Choose the channel that works best for your situation.
            </p>
          </div>
          <ContactMethodsGrid />
        </div>
      </section>

      <section className="bg-slate-50 py-12 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Send us a message</h2>
            <p className="mt-2 text-muted-foreground">
              Share your requirement and our support team will follow up shortly.
            </p>
          </div>
          <ContactForm />
        </div>
      </section>

      <section className="bg-white py-12 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-slate-200 py-0">
              <CardHeader>
                <CardTitle className="text-2xl text-slate-900">Visit our office</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0 text-sm text-slate-700">
                <p className="inline-flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-slate-500" />
                  DemoRentals Office, HSR Layout, Bengaluru, Karnataka 560102
                </p>
                <p className="inline-flex items-center gap-2">
                  <Clock3 className="size-4 text-slate-500" />
                  Monday to Sunday, 9:00 AM to 8:00 PM
                </p>
              </CardContent>
            </Card>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <iframe
                title="DemoRentals office location map"
                src="https://www.google.com/maps?q=HSR+Layout+Bengaluru&output=embed"
                className="h-72 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-12 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Frequently asked questions
            </h2>
            <p className="mt-2 text-muted-foreground">
              Quick answers for account, billing, support, and technical issues.
            </p>
          </div>
          <FaqSection data={faqData} categories={faqCategories} />
        </div>
      </section>

      <section className="bg-white py-12 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <NewsletterSignup sourcePage="contact" />
        </div>
      </section>
    </div>
  );
}
