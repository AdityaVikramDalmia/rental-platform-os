"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { signOutAction } from "@/app/actions/auth";

type NavItem = {
  label: string;
  href: string;
};

interface AuthUser {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  profilePictureUrl?: string | null;
}

interface PublicHeaderProps {
  user?: AuthUser | null;
  signInUrl?: string | null;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Homepage", href: "/homepage" },
  { label: "Browse Listings", href: "/listings" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Contact", href: "/contact" },
  { label: "Owner Services", href: "/owner-services" },
];

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicHeader({ user, signInUrl }: PublicHeaderProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const whatsappPhone = process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE ?? "";

  const whatsappHref = useMemo(() => {
    const message =
      "Hi DemoRentals team, I am looking for a rental home. Can you help me with available options?";

    if (!whatsappPhone.trim()) {
      return null;
    }

    return `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
  }, [whatsappPhone]);

  return (
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-slate-900 text-sm font-bold text-white">
            F
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide text-slate-900">DemoRentals</p>
            <p className="text-xs text-slate-500">Verified rental homes</p>
          </div>
        </div>

        <nav className="hidden items-center gap-6 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "text-sm transition-colors",
                isActivePath(pathname, item.href)
                  ? "font-semibold text-slate-900"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {whatsappHref ? (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                <MessageCircle className="size-4" />
                WhatsApp Us
              </Button>
            </a>
          ) : (
            <Button asChild size="sm">
              <Link href="/contact">Contact Us</Link>
            </Button>
          )}

          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-xs font-semibold text-white">
                {user.firstName?.[0] ?? user.email[0]?.toUpperCase() ?? "U"}
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
                >
                  Sign Out
                </button>
              </form>
            </div>
          ) : (
            signInUrl && (
              <a
                href={signInUrl}
                className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Sign In
              </a>
            )
          )}
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[85vw] sm:w-[380px]" showCloseButton={false}>
            <SheetHeader className="flex-row items-center justify-between">
              <SheetTitle>Menu</SheetTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="size-5" />
              </Button>
            </SheetHeader>
            <div className="mt-2 flex flex-col gap-2 px-4">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm",
                    isActivePath(pathname, item.href)
                      ? "bg-slate-900/5 font-semibold text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  {item.label}
                </Link>
              ))}

              {whatsappHref ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileOpen(false)}
                  className="mt-3"
                >
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                    <MessageCircle className="size-4" />
                    WhatsApp Us
                  </Button>
                </a>
              ) : (
                <Button asChild className="mt-3 w-full">
                  <Link href="/contact" onClick={() => setMobileOpen(false)}>
                    Contact Us
                  </Link>
                </Button>
              )}

              <div className="mt-4 border-t border-slate-100 pt-4">
                {user ? (
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700"
                    >
                      Sign Out
                    </button>
                  </form>
                ) : (
                  signInUrl && (
                    <a
                      href={signInUrl}
                      className="block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white"
                    >
                      Sign In
                    </a>
                  )
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
