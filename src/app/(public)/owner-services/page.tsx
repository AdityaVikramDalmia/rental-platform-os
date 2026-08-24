import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import {
  BadgeCheck,
  BarChart3,
  FileCheck2,
  HandCoins,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { SYSTEM_CONFIG_KEYS } from "../../../../lib/constants";
import { formatPhoneDisplay } from "../../../../lib/validators";
import { OwnerServicesClient } from "./owner-services-client";

type ContactSettings = {
  contactPhone: string | null;
  whatsappPhone: string | null;
};

const FALLBACK_CONTACT_PHONE = "+91 9XXXX XXXXX";
const FALLBACK_WHATSAPP_PHONE = "+91 9XXXX XXXXX";

export const metadata: Metadata = {
  title: "Owner Services | DemoRentals",
  description:
    "Let DemoRentals manage your property with guaranteed rent collection, professional tenant screening, and end-to-end management support.",
};

const STEPS = [
  {
    title: "Share your property details",
    description: "Fill in the form below with basic info about your property and location.",
  },
  {
    title: "Our team contacts you within 24 hours",
    description: "We\u2019ll discuss your requirements, rental expectations, and timeline.",
  },
  {
    title: "We handle tenant placement & management",
    description: "From screening to move-in, we manage the entire process end to end.",
  },
  {
    title: "You earn hassle-free rental income",
    description: "Sit back while we handle collections, maintenance, and reporting.",
  },
] as const;

const SERVICES: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: HandCoins,
    title: "Rent Collection",
    description: "Monthly collections, follow-ups, and payment tracking \u2014 handled end to end.",
  },
  {
    icon: ShieldCheck,
    title: "Tenant Screening",
    description: "Background checks and profile validation before any move-in commitment.",
  },
  {
    icon: FileCheck2,
    title: "Legal Support",
    description: "Rental agreements, KYC paperwork, and compliance coordination.",
  },
  {
    icon: Wrench,
    title: "Maintenance",
    description: "Issue intake, vendor coordination, and maintenance tracking with updates.",
  },
  {
    icon: BadgeCheck,
    title: "Pricing",
    description: "Simple management pricing with clear expectations before onboarding.",
  },
  {
    icon: BarChart3,
    title: "Reports",
    description: "Recurring updates on occupancy, tenant activity, and maintenance events.",
  },
];

function parseConfigPhone(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  let parsedValue: unknown = value;
  try {
    parsedValue = JSON.parse(value) as unknown;
  } catch {
    parsedValue = value;
  }

  const raw = String(parsedValue).trim();
  if (!raw) {
    return null;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return digits;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }

  return null;
}

async function getContactSettings(): Promise<ContactSettings> {
  const [contactResult, whatsappResult] = await Promise.allSettled([
    fetchQuery(api.systemConfig.get, { key: SYSTEM_CONFIG_KEYS.DEMORENTALS_CONTACT_PHONE }),
    fetchQuery(api.systemConfig.get, { key: SYSTEM_CONFIG_KEYS.DEMORENTALS_WHATSAPP_PHONE }),
  ]);

  const contactPhone =
    contactResult.status === "fulfilled" ? parseConfigPhone(contactResult.value?.value) : null;
  const whatsappPhone =
    whatsappResult.status === "fulfilled" ? parseConfigPhone(whatsappResult.value?.value) : null;

  return { contactPhone, whatsappPhone };
}

export default async function OwnerServicesPage() {
  const { contactPhone, whatsappPhone } = await getContactSettings();

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:py-12">
        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Owner Services</h1>
          <p className="text-sm text-slate-600">
            DemoRentals helps property owners stay hands-off while we handle tenant placement, rent
            collection, and day-to-day management.
          </p>
        </header>

        {/* How It Works */}
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
            How It Works
          </h2>
          <div className="space-y-3">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What We Handle */}
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
            What We Handle
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {SERVICES.map((service) => {
              const Icon = service.icon;
              return (
                <div
                  key={service.title}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 hover:shadow"
                >
                  <span className="inline-flex size-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                    <Icon className="size-4" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-slate-900">{service.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    {service.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Contact Form */}
        <section id="owner-service-contact" className="scroll-mt-8 space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
            Share Your Property Details
          </h2>
          <OwnerServicesClient />
        </section>

        {/* Contact Info */}
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
            Other Ways to Reach Us
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                <Phone className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
                  Phone
                </p>
                {contactPhone ? (
                  <a
                    href={`tel:+91${contactPhone}`}
                    className="text-sm font-medium text-indigo-700 hover:text-indigo-800"
                  >
                    {formatPhoneDisplay(contactPhone)}
                  </a>
                ) : (
                  <p className="text-sm text-slate-500">{FALLBACK_CONTACT_PHONE}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <MessageCircle className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
                  WhatsApp
                </p>
                {whatsappPhone ? (
                  <a
                    href={`https://wa.me/91${whatsappPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    {formatPhoneDisplay(whatsappPhone)}
                  </a>
                ) : (
                  <p className="text-sm text-slate-500">{FALLBACK_WHATSAPP_PHONE}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Mail className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
                  Email
                </p>
                <a
                  href="mailto:support@example.com"
                  className="text-sm font-medium text-amber-700 hover:text-amber-800"
                >
                  support@example.com
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Trust line */}
        <p className="text-center text-xs text-slate-400">
          500+ Properties Managed&ensp;&middot;&ensp;96% Collection Rate&ensp;&middot;&ensp;24hr
          Response Time
        </p>
      </div>
    </main>
  );
}
