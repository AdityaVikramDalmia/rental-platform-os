import type { Metadata } from "next";
import { ToolsPageClient } from "./tools-page-client";

export const metadata: Metadata = {
  title: {
    absolute: "Tenant Tools | DemoRentals",
  },
  description:
    "Use DemoRentals's tenant tools to estimate move-in costs, compare commute times, discover your roommate style, and track your rental checklist.",
  alternates: {
    canonical: "/tools",
  },
};

export default function TenantToolsPage() {
  return <ToolsPageClient />;
}
