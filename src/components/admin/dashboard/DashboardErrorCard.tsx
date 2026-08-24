"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DashboardErrorCardProps = {
  section: string;
  action?: () => void;
};

export function DashboardErrorCard({ section, action }: DashboardErrorCardProps) {
  return (
    <Card className="border-red-200 bg-red-50/40 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-red-900">
          <AlertTriangle className="size-4" />
          Failed to load {section}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-red-800">
        <p>This section hit an unexpected error. Refresh the page or retry this block.</p>
        {action ? (
          <Button type="button" variant="outline" onClick={action} className="border-red-300">
            Retry section
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
