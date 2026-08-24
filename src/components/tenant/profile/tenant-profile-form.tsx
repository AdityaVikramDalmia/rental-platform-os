"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BHK_CONFIG } from "../../../../lib/constants";
import { normalizePhone } from "../../../../lib/validators";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const propertyTypeOptions = Object.values(BHK_CONFIG);

type TenantProfilePayload = {
  user_id: Id<"users">;
  name: string;
  email: string;
  phone: string | null;
  preferences: {
    localities: string[];
    budget_min: number | null;
    budget_max: number | null;
    property_types: string[];
  };
};

function parseBudgetRupees(value: string): { rupees: number | null; isValid: boolean } {
  const trimmed = value.trim();

  if (!trimmed) {
    return { rupees: null, isValid: true };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { rupees: null, isValid: false };
  }

  const rupees = Number.parseInt(trimmed, 10);
  if (Number.isNaN(rupees) || rupees < 0) {
    return { rupees: null, isValid: false };
  }

  return { rupees, isValid: true };
}

const tenantProfileFormSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
    phone: z.string().trim(),
    localities: z.array(z.string().trim().min(1)).max(20, "You can add up to 20 localities"),
    budget_min: z.string().trim(),
    budget_max: z.string().trim(),
    property_types: z.array(z.string()),
  })
  .superRefine((values, ctx) => {
    if (values.phone.length > 0) {
      try {
        normalizePhone(values.phone);
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["phone"],
          message: "Phone must be a valid 10-digit number",
        });
      }
    }

    for (const [index, propertyType] of values.property_types.entries()) {
      if (!propertyTypeOptions.includes(propertyType as (typeof propertyTypeOptions)[number])) {
        ctx.addIssue({
          code: "custom",
          path: ["property_types", index],
          message: "Invalid property type",
        });
      }
    }

    const budgetMinParsed = parseBudgetRupees(values.budget_min);
    const budgetMaxParsed = parseBudgetRupees(values.budget_max);

    if (!budgetMinParsed.isValid) {
      ctx.addIssue({
        code: "custom",
        path: ["budget_min"],
        message: "Minimum budget must be a non-negative whole number",
      });
    }

    if (!budgetMaxParsed.isValid) {
      ctx.addIssue({
        code: "custom",
        path: ["budget_max"],
        message: "Maximum budget must be a non-negative whole number",
      });
    }

    if (
      budgetMinParsed.rupees !== null &&
      budgetMaxParsed.rupees !== null &&
      budgetMinParsed.rupees > budgetMaxParsed.rupees
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["budget_max"],
        message: "Maximum budget must be greater than or equal to minimum budget",
      });
    }
  });

type TenantProfileFormValues = z.infer<typeof tenantProfileFormSchema>;

type TenantProfileFormProps = {
  profile: TenantProfilePayload;
};

function paiseToInputValue(value: number | null): string {
  if (value === null) {
    return "";
  }

  const rupees = value / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

function toPaise(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const rupees = Number.parseInt(trimmed, 10);
  if (Number.isNaN(rupees) || rupees < 0) {
    return null;
  }

  return rupees * 100;
}

export function TenantProfileForm({ profile }: TenantProfileFormProps) {
  const updateProfile = useMutation(api.tenantProfile.updateMine);
  const [localityInput, setLocalityInput] = useState("");

  const form = useForm<TenantProfileFormValues>({
    resolver: zodResolver(tenantProfileFormSchema),
    defaultValues: {
      name: profile.name,
      phone: profile.phone ?? "",
      localities: profile.preferences.localities,
      budget_min: paiseToInputValue(profile.preferences.budget_min),
      budget_max: paiseToInputValue(profile.preferences.budget_max),
      property_types: profile.preferences.property_types,
    },
  });

  async function onSubmit(values: TenantProfileFormValues) {
    try {
      await updateProfile({
        name: values.name.trim(),
        phone: values.phone.trim().length > 0 ? values.phone.trim() : null,
        preferences: {
          localities: values.localities,
          budget_min: toPaise(values.budget_min),
          budget_max: toPaise(values.budget_max),
          property_types: values.property_types,
        },
      });

      toast.success("Profile updated");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't save your profile changes. Please try again.",
      );
    }
  }

  function addLocality() {
    const trimmed = localityInput.trim();
    if (!trimmed) {
      return;
    }

    const existing = form.getValues("localities");
    const isDuplicate = existing.some((value) => value.toLowerCase() === trimmed.toLowerCase());

    if (!isDuplicate) {
      form.setValue("localities", [...existing, trimmed], {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

    setLocalityInput("");
  }

  function removeLocality(locality: string) {
    const next = form.getValues("localities").filter((value) => value !== locality);
    form.setValue("localities", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900">Edit preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your full name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="10-digit phone"
                      inputMode="numeric"
                      maxLength={14}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="localities"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preferred localities</FormLabel>
                  <FormControl>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          value={localityInput}
                          onChange={(event) => setLocalityInput(event.target.value)}
                          placeholder="Add locality"
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addLocality();
                            }
                          }}
                        />
                        <Button type="button" variant="outline" onClick={addLocality}>
                          <Plus className="size-4" />
                          Add
                        </Button>
                      </div>

                      {field.value.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {field.value.map((locality) => (
                            <Badge
                              key={locality}
                              variant="outline"
                              className="gap-1 border-cyan-200 bg-cyan-50 text-cyan-700"
                            >
                              {locality}
                              <button
                                type="button"
                                className="rounded-full p-0.5 hover:bg-cyan-100"
                                onClick={() => removeLocality(locality)}
                                aria-label={`Remove ${locality}`}
                              >
                                <X className="size-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">No localities added yet.</p>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="budget_min"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget min (INR/month)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="1" placeholder="15000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="budget_max"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget max (INR/month)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="1" placeholder="40000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="property_types"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preferred property types</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {propertyTypeOptions.map((propertyType) => {
                        const checked = field.value.includes(propertyType);
                        const checkboxId = `tenant-property-type-${propertyType}`;

                        return (
                          <label
                            key={propertyType}
                            htmlFor={checkboxId}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 hover:border-cyan-300 hover:bg-cyan-50"
                          >
                            <Checkbox
                              id={checkboxId}
                              checked={checked}
                              onCheckedChange={(nextChecked) => {
                                const next =
                                  nextChecked === true
                                    ? [...field.value, propertyType]
                                    : field.value.filter((value) => value !== propertyType);
                                field.onChange(next);
                              }}
                            />
                            <span className="cursor-pointer">{propertyType}</span>
                          </label>
                        );
                      })}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="h-11 min-h-11 w-full bg-cyan-600 text-white hover:bg-cyan-700"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Save profile
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
