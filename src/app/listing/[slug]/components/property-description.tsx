"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PropertyDescriptionProps = {
  description?: string;
};

const TRUNCATE_LENGTH = 300;

export function PropertyDescription({ description }: PropertyDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  const shouldTruncate = description !== undefined && description.length > TRUNCATE_LENGTH;
  const displayText = !description
    ? null
    : shouldTruncate && !expanded
      ? description.slice(0, TRUNCATE_LENGTH) + "..."
      : description;

  return (
    <Card className="border-0 shadow-md">
      <CardHeader>
        <CardTitle className="text-lg">About this property</CardTitle>
      </CardHeader>
      <CardContent>
        {displayText ? (
          <div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {displayText}
            </p>
            {shouldTruncate && (
              <Button
                variant="link"
                size="sm"
                className="mt-1 h-auto p-0 text-xs"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "Show less" : "Read more"}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">No description provided</p>
        )}
      </CardContent>
    </Card>
  );
}
