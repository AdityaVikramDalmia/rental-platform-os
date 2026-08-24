"use client";

import { useMemo } from "react";
import { Download, RotateCcw, Share2 } from "lucide-react";
import {
  RENTAL_CHECKLIST_CATEGORIES,
  RENTAL_CHECKLIST_ITEMS,
  type RentalChecklistCategory,
} from "@/lib/checklist-data";
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "demorentals-rental-checklist";

function escapeCsvValue(value: string): string {
  const shouldQuote = value.includes(",") || value.includes("\n") || value.includes('"');
  if (!shouldQuote) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function formatDateForFilename(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function RentalChecklist() {
  const [completedMap, setCompletedMap, isReady] = useLocalStorage<Record<string, boolean>>(
    STORAGE_KEY,
    {},
  );
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const groupedItems = useMemo(() => {
    return RENTAL_CHECKLIST_CATEGORIES.map((category) => ({
      category,
      items: RENTAL_CHECKLIST_ITEMS.filter((item) => item.category === category),
    }));
  }, []);

  const totalItems = RENTAL_CHECKLIST_ITEMS.length;
  const completedCount = useMemo(
    () => RENTAL_CHECKLIST_ITEMS.filter((item) => completedMap[item.id]).length,
    [completedMap],
  );
  const completionPercentage = Math.round((completedCount / totalItems) * 100);

  const toggleItem = (itemId: string, checked: boolean) => {
    setCompletedMap((previousMap) => {
      if (checked) {
        return {
          ...previousMap,
          [itemId]: true,
        };
      }

      const nextMap = { ...previousMap };
      delete nextMap[itemId];
      return nextMap;
    });
  };

  const handleExportCsv = () => {
    const csvHeader = "Category,Item,Completed";
    const csvRows = RENTAL_CHECKLIST_ITEMS.map((item) => {
      const row = [
        escapeCsvValue(item.category),
        escapeCsvValue(item.label),
        completedMap[item.id] ? "Yes" : "No",
      ];

      return row.join(",");
    });

    const csvContent = [csvHeader, ...csvRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `demorentals-rental-checklist-${formatDateForFilename(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (!canShare || typeof navigator.share !== "function") {
      return;
    }

    const completedItems = RENTAL_CHECKLIST_ITEMS.filter((item) => completedMap[item.id]);
    const shareText = [
      `DemoRentals Rental Checklist: ${completedCount}/${totalItems} complete`,
      ...completedItems.map((item) => `- ${item.label}`),
    ].join("\n");

    try {
      await navigator.share({
        title: "DemoRentals Rental Checklist",
        text: shareText,
      });
    } catch {}
  };

  const handleReset = () => {
    if (!window.confirm("Reset all checklist items?")) {
      return;
    }

    setCompletedMap({});
  };

  if (!isReady) {
    return (
      <Card className="py-0">
        <CardHeader>
          <CardTitle>Loading checklist...</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-6">
          <div className="h-2 w-full animate-pulse rounded-full bg-slate-200" />
          <div className="h-10 w-full animate-pulse rounded-md bg-slate-200" />
          <div className="h-10 w-full animate-pulse rounded-md bg-slate-200" />
          <div className="h-10 w-full animate-pulse rounded-md bg-slate-200" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-0">
      <CardHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Move-in prep tracker</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCsv}>
                <Download className="size-4" />
                Export CSV
              </Button>
              {canShare ? (
                <Button variant="outline" size="sm" onClick={handleShare} className="md:hidden">
                  <Share2 className="size-4" />
                  Share
                </Button>
              ) : null}
              <Button variant="destructive" size="sm" onClick={handleReset}>
                <RotateCcw className="size-4" />
                Reset
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm text-slate-600">
              <span>
                {completedCount} of {totalItems} complete
              </span>
              <span>{completionPercentage}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-6">
        <Accordion
          type="multiple"
          defaultValue={RENTAL_CHECKLIST_CATEGORIES.map((category) => categoryToValue(category))}
          className="space-y-1"
        >
          {groupedItems.map(({ category, items }) => (
            <AccordionItem key={category} value={categoryToValue(category)}>
              <AccordionTrigger className="py-3 text-sm font-semibold text-slate-800 hover:no-underline">
                {category}
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-2">
                  {items.map((item) => {
                    const checked = completedMap[item.id] === true;
                    const checkboxId = `checklist-${item.id}`;

                    return (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 rounded-md p-2 hover:bg-slate-50"
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={checked}
                          onCheckedChange={(value) => toggleItem(item.id, value === true)}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={checkboxId}
                          className="cursor-pointer text-sm font-normal text-slate-700"
                        >
                          {item.label}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function categoryToValue(category: RentalChecklistCategory): string {
  return category.toLowerCase().replaceAll(" ", "-");
}
