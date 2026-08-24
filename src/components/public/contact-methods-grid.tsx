import { CalendarClock, Mail, MapPin, MessageCircle, Phone, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ContactCard = {
  title: string;
  description: string;
  href?: string;
  actionLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  isComingSoon?: boolean;
};

function formatPhoneDisplay(phone: string): string {
  if (phone.length !== 10) {
    return `+91 ${phone}`;
  }

  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function ContactMethodsGrid() {
  const contactPhone = digitsOnly(process.env.NEXT_PUBLIC_DEMORENTALS_CONTACT_PHONE ?? "");
  const whatsappPhone = digitsOnly(process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE ?? "");
  const whatsappMessage = encodeURIComponent("Hi DemoRentals team, I need support with rentals.");

  const cards: ContactCard[] = [
    {
      title: "WhatsApp",
      description: "Fastest way to reach our support team during business hours.",
      href: whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${whatsappMessage}` : undefined,
      actionLabel: "Chat now",
      icon: MessageCircle,
    },
    {
      title: "Phone",
      description: "Speak directly with our rental support specialists.",
      href: contactPhone ? `tel:+91${contactPhone}` : undefined,
      actionLabel: contactPhone ? formatPhoneDisplay(contactPhone) : "Call support",
      icon: Phone,
    },
    {
      title: "Email",
      description: "Share detailed requirements and documents over email.",
      href: "mailto:support@example.com",
      actionLabel: "support@example.com",
      icon: Mail,
    },
    {
      title: "Video Call",
      description: "Book a guided consultation for complex rental needs.",
      actionLabel: "Coming soon",
      icon: CalendarClock,
      isComingSoon: true,
    },
    {
      title: "Live Chat",
      description: "Real-time chat assistance directly on the website.",
      actionLabel: "Coming soon",
      icon: Sparkles,
      isComingSoon: true,
    },
    {
      title: "Visit Office",
      description: "DemoRentals Office, HSR Layout, Bengaluru, Karnataka 560102.",
      href: "https://maps.google.com/?q=HSR+Layout+Bengaluru",
      actionLabel: "Open location",
      icon: MapPin,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <Card
            key={card.title}
            className={`border-slate-200 py-0 transition-shadow hover:shadow-lg ${
              card.isComingSoon ? "opacity-60" : ""
            }`}
          >
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex size-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <Icon className="size-5" />
                </div>
                {card.isComingSoon && <Badge variant="outline">Coming Soon</Badge>}
              </div>
              <CardTitle className="text-base text-slate-900">{card.title}</CardTitle>
              <CardDescription className="text-sm text-slate-600">
                {card.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {card.isComingSoon ? (
                <div className="cursor-not-allowed rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
                  {card.actionLabel}
                </div>
              ) : card.href ? (
                <a
                  href={card.href}
                  target={card.href.startsWith("http") ? "_blank" : undefined}
                  rel={card.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  {card.actionLabel}
                </a>
              ) : (
                <div className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
                  Contact details unavailable
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
