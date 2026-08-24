"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import {
  generateFlatNumberPreview,
  validateFlatNumberTemplate,
  validateFloorLabels,
} from "../../../lib/validators";
import { FloorLabelsInput } from "@/components/admin/FloorLabelsInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

const buildingFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    total_floors: z.number().int().min(1, "Must have at least 1 floor"),
    flats_per_floor: z.number().int().min(1, "Must be at least 1").optional(),
    total_flats: z.number().int().min(1, "Must be at least 1").optional(),
    floor_labels: z.array(z.string()).min(1, "At least one floor label required"),
    use_flat_number_template: z.boolean(),
    template_prefix: z.string().optional(),
    template_floor_digits: z.number().int().min(1).max(4).optional(),
    template_unit_digits: z.number().int().min(1).max(4).optional(),
    notes: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.use_flat_number_template) {
      return;
    }

    if (value.template_floor_digits === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Floor digits is required",
        path: ["template_floor_digits"],
      });
    }

    if (value.template_unit_digits === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Unit digits is required",
        path: ["template_unit_digits"],
      });
    }
  });

type BuildingFormValues = z.infer<typeof buildingFormSchema>;

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function toInputNumber(value: number | undefined): string | number {
  if (value === undefined || Number.isNaN(value)) {
    return "";
  }

  return value;
}

function parseInputNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) ? undefined : parsedValue;
}

function getDefaultValues(building?: Doc<"buildings">): BuildingFormValues {
  return {
    name: building?.name ?? "",
    total_floors: building?.total_floors ?? 1,
    flats_per_floor: building?.flats_per_floor,
    total_flats: building?.total_flats,
    floor_labels: building?.floor_labels ?? [],
    use_flat_number_template: building?.flat_number_template !== undefined,
    template_prefix: building?.flat_number_template?.prefix ?? "",
    template_floor_digits: building?.flat_number_template?.floor_digits ?? 2,
    template_unit_digits: building?.flat_number_template?.unit_digits ?? 2,
    notes: building?.notes ?? "",
  };
}

type BuildingCreateDialogProps = {
  open: boolean;
  openChangeAction: (open: boolean) => void;
  societyId: Id<"societies">;
  building?: Doc<"buildings">;
};

export function BuildingCreateDialog({
  open,
  openChangeAction,
  societyId,
  building,
}: BuildingCreateDialogProps) {
  const createBuilding = useMutation(api.buildings.create);
  const updateBuilding = useMutation(api.buildings.update);
  const isEditMode = building !== undefined;

  const [isTotalFlatsOverridden, setIsTotalFlatsOverridden] = useState(false);

  const form = useForm<BuildingFormValues>({
    resolver: zodResolver(buildingFormSchema),
    defaultValues: getDefaultValues(),
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset(getDefaultValues(building));
    setIsTotalFlatsOverridden(false);
  }, [building, form, open]);

  const totalFloors = form.watch("total_floors");
  const flatsPerFloor = form.watch("flats_per_floor");
  const totalFlats = form.watch("total_flats");
  const useTemplate = form.watch("use_flat_number_template");
  const templatePrefix = form.watch("template_prefix");
  const templateFloorDigits = form.watch("template_floor_digits");
  const templateUnitDigits = form.watch("template_unit_digits");

  const computedTotalFlats = useMemo(() => {
    if (
      totalFloors === undefined ||
      flatsPerFloor === undefined ||
      totalFloors < 1 ||
      flatsPerFloor < 1
    ) {
      return undefined;
    }

    return totalFloors * flatsPerFloor;
  }, [flatsPerFloor, totalFloors]);

  useEffect(() => {
    if (!open || isTotalFlatsOverridden || computedTotalFlats === undefined) {
      return;
    }

    if (totalFlats !== computedTotalFlats) {
      form.setValue("total_flats", computedTotalFlats, { shouldValidate: true });
    }
  }, [computedTotalFlats, form, isTotalFlatsOverridden, open, totalFlats]);

  const templatePreview = useMemo(() => {
    if (!useTemplate) {
      return null;
    }

    if (templateFloorDigits === undefined || templateUnitDigits === undefined) {
      return "Set floor and unit digits to see preview";
    }

    try {
      return generateFlatNumberPreview({
        prefix: templatePrefix,
        floor_digits: templateFloorDigits,
        unit_digits: templateUnitDigits,
      });
    } catch {
      return "Invalid template";
    }
  }, [templateFloorDigits, templatePrefix, templateUnitDigits, useTemplate]);

  async function onSubmit(values: BuildingFormValues) {
    try {
      const cleanedFloorLabels = validateFloorLabels(values.floor_labels);

      const flatNumberTemplate = values.use_flat_number_template
        ? {
            prefix: normalizeOptionalText(values.template_prefix),
            floor_digits: values.template_floor_digits ?? 0,
            unit_digits: values.template_unit_digits ?? 0,
          }
        : undefined;

      if (flatNumberTemplate) {
        validateFlatNumberTemplate(flatNumberTemplate);
      }

      const payload = {
        name: values.name.trim(),
        total_floors: values.total_floors,
        flats_per_floor: values.flats_per_floor,
        total_flats: values.total_flats,
        floor_labels: cleanedFloorLabels,
        notes: normalizeOptionalText(values.notes),
      };

      if (isEditMode && building) {
        await updateBuilding({
          id: building._id,
          ...payload,
          flat_number_template: flatNumberTemplate ?? null,
        });

        toast.success("Building updated");
      } else {
        await createBuilding({
          society_id: societyId,
          ...payload,
          flat_number_template: flatNumberTemplate,
        });

        toast.success("Building created");
      }

      openChangeAction(false);
      form.reset(getDefaultValues());
      setIsTotalFlatsOverridden(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save building";

      if (message.toLowerCase().includes("already exists")) {
        toast.error("A building with this name already exists in this society");
        return;
      }

      toast.error(message);
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={openChangeAction}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{building ? "Edit Building" : "Add Building"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update building details, floor labels, and flat template."
              : "Create a building and configure floors for lead submission."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Tower A"
                      className="h-10 border-slate-300"
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="total_floors"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Floors</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        value={toInputNumber(field.value)}
                        onChange={(event) => {
                          field.onChange(parseInputNumber(event.target.value));
                        }}
                        className="h-10 border-slate-300"
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="flats_per_floor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Flats/Floor</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        value={toInputNumber(field.value)}
                        onChange={(event) => {
                          field.onChange(parseInputNumber(event.target.value));
                          setIsTotalFlatsOverridden(false);
                        }}
                        className="h-10 border-slate-300"
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="total_flats"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Flats</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        value={toInputNumber(field.value)}
                        onChange={(event) => {
                          setIsTotalFlatsOverridden(true);
                          field.onChange(parseInputNumber(event.target.value));
                        }}
                        className="h-10 border-slate-300"
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <p className="text-xs text-slate-500">
                      {computedTotalFlats === undefined
                        ? "Set floors and flats/floor to auto-calculate"
                        : `Auto-calculated: ${computedTotalFlats}`}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="floor_labels"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Floor Labels</FormLabel>
                  <FormControl>
                    <FloorLabelsInput
                      value={field.value}
                      action={field.onChange}
                      totalFloors={totalFloors}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="use_flat_number_template"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div className="space-y-1">
                    <FormLabel>Use flat number template</FormLabel>
                    <p className="text-xs text-slate-500">
                      Configure prefix and digit pattern for flat number validation.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {useTemplate ? (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="template_prefix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prefix</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="A-"
                            className="h-10 border-slate-300 bg-white"
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="template_floor_digits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Floor Digits</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={4}
                            value={toInputNumber(field.value)}
                            onChange={(event) =>
                              field.onChange(parseInputNumber(event.target.value))
                            }
                            className="h-10 border-slate-300 bg-white"
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="template_unit_digits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Digits</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={4}
                            value={toInputNumber(field.value)}
                            onChange={(event) =>
                              field.onChange(parseInputNumber(event.target.value))
                            }
                            className="h-10 border-slate-300 bg-white"
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <p className="text-sm text-slate-600">Preview: {templatePreview}</p>
              </div>
            ) : null}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <textarea
                      {...field}
                      rows={3}
                      placeholder="Internal notes"
                      className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => openChangeAction(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-slate-900 text-white hover:bg-slate-800"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : isEditMode ? (
                  "Update Building"
                ) : (
                  "Create Building"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
