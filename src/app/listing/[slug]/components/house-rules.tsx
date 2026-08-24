"use client";

import { CheckCircle2, ListOrdered } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type HouseRulesProps = {
  rules?: string[];
};

export function HouseRules({ rules }: HouseRulesProps) {
  const normalizedRules = (rules ?? [])
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0);

  if (normalizedRules.length === 0) {
    return null;
  }

  return (
    <Card className="border-0 shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ListOrdered className="size-5 text-muted-foreground" />
          House Rules
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {normalizedRules.map((rule, index) => (
            <li
              key={`${index + 1}-${rule}`}
              className="flex items-start gap-3 rounded-lg bg-muted/40 px-3 py-2.5"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span className="text-sm leading-relaxed text-foreground">{rule}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
