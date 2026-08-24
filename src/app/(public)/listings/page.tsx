import type { Metadata } from "next";
import { Suspense } from "react";
import { ConvexClientProvider } from "@/components/shared/ConvexClientProvider";
import { ListingsDirectory } from "@/components/public/listings/listings-directory";

export const metadata: Metadata = {
  title: "Browse Listings",
  description: "Browse verified rental listings. Filter by locality, budget, and property type.",
  openGraph: {
    title: "Browse Listings - DemoRentals",
    description: "Browse verified rental listings. Filter by locality, budget, and property type.",
    type: "website",
  },
};

export default function ListingsPage() {
  return (
    <ConvexClientProvider>
      <Suspense>
        <ListingsDirectory />
      </Suspense>
    </ConvexClientProvider>
  );
}
