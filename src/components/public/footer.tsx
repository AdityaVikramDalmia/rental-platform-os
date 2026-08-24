import Link from "next/link";
import { Facebook, Instagram, Linkedin, Mail, MapPin, MessageCircle, Phone } from "lucide-react";

const NAV_LINKS = [
  { label: "Homepage", href: "/homepage" },
  { label: "Browse Listings", href: "/listings" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Contact", href: "/contact" },
  { label: "Owner Services", href: "/owner-services" },
] as const;

function formatPhoneDisplay(phone: string): string {
  if (phone.length !== 10) {
    return `+91 ${phone}`;
  }

  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

export function PublicFooter() {
  const contactPhone = process.env.NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE ?? "";
  const whatsappPhone = process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE ?? "";
  const whatsappMessage = "Hi DemoRentals team, I need help with rental options.";
  const whatsappHref = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  return (
    <footer className="bg-slate-900 text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-12 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">DemoRentals</h3>
          <p className="text-sm text-slate-300">
            Verified rental listings, guided visits, and transparent pricing for faster move-ins.
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-200">
            Navigation
          </h4>
          <ul className="space-y-2 text-sm text-slate-300">
            {NAV_LINKS.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="transition-colors hover:text-white">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-200">Contact</h4>
          <ul className="space-y-2 text-sm text-slate-300">
            {contactPhone && (
              <li>
                <a
                  href={`tel:+91${contactPhone}`}
                  className="inline-flex items-center gap-2 transition-colors hover:text-white"
                >
                  <Phone className="size-4" />
                  {formatPhoneDisplay(contactPhone)}
                </a>
              </li>
            )}
            <li>
              <a
                href="mailto:support@example.com"
                className="inline-flex items-center gap-2 transition-colors hover:text-white"
              >
                <Mail className="size-4" />
                support@example.com
              </a>
            </li>
            {whatsappHref && (
              <li>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 transition-colors hover:text-white"
                >
                  <MessageCircle className="size-4" />
                  WhatsApp Support
                </a>
              </li>
            )}
            <li className="inline-flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span>DemoRentals Office, HSR Layout, Bengaluru, Karnataka 560102</span>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-200">Social</h4>
          <div className="flex gap-3 text-slate-300">
            <a
              href="#"
              aria-label="Facebook"
              className="rounded-md p-2 transition-all hover:bg-slate-800 hover:text-white hover:opacity-80"
            >
              <Facebook className="size-4" />
            </a>
            <a
              href="#"
              aria-label="Instagram"
              className="rounded-md p-2 transition-all hover:bg-slate-800 hover:text-white hover:opacity-80"
            >
              <Instagram className="size-4" />
            </a>
            <a
              href="#"
              aria-label="LinkedIn"
              className="rounded-md p-2 transition-all hover:bg-slate-800 hover:text-white hover:opacity-80"
            >
              <Linkedin className="size-4" />
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <div className="mx-auto max-w-7xl px-4 py-4 text-sm text-slate-400 sm:px-6 lg:px-8">
          &copy; {new Date().getFullYear()} DemoRentals. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
