"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

type BreadcrumbNavProps = {
  society_name: string | null;
  building_name: string | null;
  bhk_config: string;
};

export function BreadcrumbNav({ society_name, building_name, bhk_config }: BreadcrumbNavProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Link href="/listings" className="hover:text-foreground">
        Listings
      </Link>

      <ChevronRight className="size-4" />

      {society_name ? (
        <>
          <Link
            href={`/listings?locality=${encodeURIComponent(society_name)}`}
            className="hover:text-foreground"
          >
            {society_name}
          </Link>
          <ChevronRight className="size-4" />
        </>
      ) : null}

      <span className="text-foreground">
        {bhk_config} {building_name ? `in ${building_name}` : ""}
      </span>
    </nav>
  );
}
