"use client";

import { ExternalLink, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LocationMapProps = {
  address?: string;
};

export function LocationMap({ address }: LocationMapProps) {
  const normalizedAddress = address?.trim();

  if (!normalizedAddress) {
    return null;
  }

  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(normalizedAddress)}&output=embed`;
  const openMapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(normalizedAddress)}`;

  return (
    <Card className="border-0 shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPinned className="size-5 text-muted-foreground" />
          Location
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-border/60">
          <iframe
            title="Property location map"
            src={embedUrl}
            width="100%"
            height={340}
            style={{ border: 0 }}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{normalizedAddress}</p>
          <Button asChild variant="outline" size="sm">
            <a href={openMapsUrl} target="_blank" rel="noopener noreferrer">
              Open in Google Maps
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
