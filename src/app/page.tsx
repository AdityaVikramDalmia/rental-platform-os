import Link from "next/link";
import { Shield, UserCog, Home, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PORTALS = [
  {
    title: "Guard Portal",
    description: "Submit vacant flat leads and manage visits",
    href: "/guard/login",
    icon: Shield,
    disabled: false,
  },
  {
    title: "Admin Panel",
    description: "Manage societies, guards, leads, and operations",
    href: "/admin/login",
    icon: UserCog,
    disabled: false,
  },
  {
    title: "Tenant Portal",
    description: "Browse listings and submit inquiries",
    href: "/listings",
    icon: Home,
    disabled: true,
  },
  {
    title: "Owner Services",
    description: "List your property with DemoRentals",
    href: "/owner",
    icon: Building2,
    disabled: true,
  },
] as const;

export default function PortalSelector() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-16">
      <div className="mx-auto w-full max-w-lg space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Rental Platform OS</h1>
          <p className="text-base text-slate-600">Select a portal to get started</p>
        </div>

        <div className="grid gap-4">
          {PORTALS.map((portal) => (
            <Card
              key={portal.title}
              className={`border-slate-200 bg-white shadow-sm transition-shadow ${
                portal.disabled ? "opacity-50" : "hover:shadow-md"
              }`}
            >
              <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <portal.icon className="size-5 text-slate-700" />
                </div>
                <div className="space-y-0.5">
                  <CardTitle className="text-base text-slate-900">{portal.title}</CardTitle>
                  <CardDescription className="text-sm text-slate-500">
                    {portal.description}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {portal.disabled ? (
                  <Button variant="outline" className="w-full" disabled>
                    Coming Soon
                  </Button>
                ) : (
                  <Button asChild variant="default" className="w-full">
                    <Link href={portal.href}>Continue</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-center text-xs text-slate-400">
          DemoRentals Rentals &middot; Rental Platform OS Platform
        </p>

        {process.env.NODE_ENV === "development" && (
          <div className="text-center">
            <Link
              href="/dev/login"
              className="text-sm font-medium text-red-600 underline-offset-4 hover:underline"
            >
              Dev Login (bypass)
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
