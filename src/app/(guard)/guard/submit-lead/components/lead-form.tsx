"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { AVAILABILITY_TYPE, FURNISHING } from "../../../../../../lib/constants";
import { rupeesToPaise } from "../../../../../../lib/money";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { VoiceTextarea } from "@/components/shared/voice-textarea";
import { useLocale } from "next-intl";

type BuildingOption = {
  _id: Id<"buildings">;
  name: string;
  flat_number_template?: {
    prefix?: string;
    floor_digits: number;
    unit_digits: number;
  };
  floor_labels: string[];
  total_floors: number;
};

type LeadFormProps = {
  societyId: Id<"societies">;
  buildings: BuildingOption[];
  remainingLeads?: {
    submitted_today: number;
    limit: number;
    remaining: number;
  };
  isDisabled?: boolean;
  disabledMessage?: string;
  onSuccess: (
    leadId: Id<"leads">,
    status: string,
    buildingName: string,
    floor: string,
    flat: string,
  ) => void;
  onRateLimited: () => void;
};
const FURNISHING_OPTIONS = [
  FURNISHING.UNFURNISHED,
  FURNISHING.SEMI_FURNISHED,
  FURNISHING.FULLY_FURNISHED,
] as const;

export function LeadForm({
  buildings,
  remainingLeads,
  isDisabled = false,
  disabledMessage,
  onSuccess,
  onRateLimited,
}: LeadFormProps) {
  const t = useTranslations("guard.submitLead");
  const tCommon = useTranslations("guard.common");
  const locale = useLocale();
  const [showOptional, setShowOptional] = useState(false);
  const createLead = useMutation(api.leads.create);
  const leadFormSchema = z
    .object({
      building_id: z.string().min(1, t("buildingRequired")),
      floor_number: z.string().min(1, t("floorRequired")).max(10),
      flat_number: z.string().min(1, t("flatRequired")).max(20),
      owner_phone: z.string().regex(/^\d{10}$/, t("phoneInvalid")),
      availability_type: z.enum([AVAILABILITY_TYPE.VACANT_NOW, AVAILABILITY_TYPE.VACANT_FROM]),
      availability_date: z.string().optional(),
      owner_consent_to_call: z.boolean().refine((val) => val === true, {
        message: t("consentRequired"),
      }),
      owner_name: z.string().optional(),
      rent_expected: z.string().optional(),
      furnishing: z
        .enum([FURNISHING.UNFURNISHED, FURNISHING.SEMI_FURNISHED, FURNISHING.FULLY_FURNISHED])
        .optional(),
      notes: z
        .string()
        .max(500, t("maxChars", { max: 500 }))
        .optional(),
    })
    .refine(
      (data) => {
        if (data.availability_type === AVAILABILITY_TYPE.VACANT_FROM) {
          return !!data.availability_date;
        }
        return true;
      },
      { message: t("dateRequired"), path: ["availability_date"] },
    );

  type LeadFormValues = z.infer<typeof leadFormSchema>;

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      building_id: buildings.length === 1 ? String(buildings[0]._id) : "",
      floor_number: "",
      flat_number: "",
      owner_phone: "",
      availability_type: AVAILABILITY_TYPE.VACANT_NOW,
      availability_date: "",
      owner_consent_to_call: false,
      owner_name: "",
      rent_expected: "",
      furnishing: undefined,
      notes: "",
    },
    mode: "onBlur",
  });

  const isSubmitting = form.formState.isSubmitting;
  const isLimitReached = remainingLeads !== undefined && remainingLeads.remaining === 0;
  const availabilityType = form.watch("availability_type");
  const selectedBuildingId = form.watch("building_id");
  const selectedBuilding = buildings.find((b) => String(b._id) === selectedBuildingId);
  const configuredFloorLabels = useMemo(
    () =>
      (selectedBuilding?.floor_labels ?? [])
        .map((label) => label.trim())
        .filter((label) => label.length > 0),
    [selectedBuilding?.floor_labels],
  );
  const floorOptions = configuredFloorLabels;
  const isFloorDisabled = selectedBuilding === undefined || floorOptions.length === 0;
  const floorPlaceholder =
    selectedBuilding === undefined
      ? t("selectBuildingFirst")
      : floorOptions.length === 0
        ? t("noFloorsConfigured")
        : t("floorPlaceholder");
  const furnishingOptions = FURNISHING_OPTIONS.map((value) => ({
    value,
    label:
      value === FURNISHING.UNFURNISHED
        ? t("unfurnished")
        : value === FURNISHING.SEMI_FURNISHED
          ? t("semi")
          : t("fully"),
  }));

  useEffect(() => {
    const currentFloor = form.getValues("floor_number").trim();
    if (currentFloor.length === 0) {
      return;
    }

    if (!isFloorDisabled && floorOptions.includes(currentFloor)) {
      return;
    }

    form.setValue("floor_number", "", {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [floorOptions, form, isFloorDisabled, selectedBuilding]);

  async function onSubmit(values: LeadFormValues) {
    if (isDisabled) {
      toast.error(disabledMessage ?? t("inactive"));
      return;
    }

    try {
      const rentInPaise =
        values.rent_expected && values.rent_expected.trim()
          ? rupeesToPaise(Number(values.rent_expected))
          : undefined;

      let availabilityDate: number | undefined;
      if (values.availability_type === AVAILABILITY_TYPE.VACANT_FROM && values.availability_date) {
        availabilityDate = new Date(values.availability_date).getTime();
      }

      const leadId = await createLead({
        building_id: values.building_id as Id<"buildings">,
        floor_number: values.floor_number.trim(),
        flat_number: values.flat_number.trim().toUpperCase(),
        owner_phone: values.owner_phone,
        availability_type: values.availability_type,
        availability_date: availabilityDate,
        owner_consent_to_call: values.owner_consent_to_call,
        owner_name: values.owner_name?.trim() || undefined,
        rent_expected: rentInPaise,
        furnishing: values.furnishing || undefined,
        notes: values.notes?.trim() || undefined,
      });

      const building = buildings.find((b) => String(b._id) === values.building_id);
      onSuccess(
        leadId,
        "SUBMITTED",
        building?.name ?? t("building"),
        values.floor_number.trim(),
        values.flat_number.trim().toUpperCase(),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : tCommon("error");

      if (message.toLowerCase().includes("rate limit") || message.toLowerCase().includes("daily")) {
        onRateLimited();
        return;
      }

      toast.error(message);
    }
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const notesValue = form.watch("notes") ?? "";

  return (
    <div className="space-y-5">
      {isDisabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-base font-medium text-amber-900">{disabledMessage ?? t("inactive")}</p>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="building_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-slate-700">
                  {t("building")} *
                </FormLabel>
                <FormControl>
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger className="h-12 w-full rounded-xl">
                      <SelectValue placeholder={t("buildingPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {buildings.map((b) => (
                        <SelectItem key={String(b._id)} value={String(b._id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                {buildings.length === 0 && (
                  <p className="text-sm text-red-600">{t("noBuildingsFound")}</p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="floor_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-slate-700">
                    {t("floor")} *
                  </FormLabel>
                  <FormControl>
                    <Select
                      value={field.value || undefined}
                      onValueChange={field.onChange}
                      disabled={isFloorDisabled}
                    >
                      <SelectTrigger className="h-12 w-full rounded-xl" disabled={isFloorDisabled}>
                        <SelectValue placeholder={floorPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {floorOptions.map((label) => (
                          <SelectItem key={label} value={label}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  {selectedBuilding !== undefined && floorOptions.length === 0 && (
                    <p className="text-sm text-red-600">{t("noFloorLabels")}</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="flat_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-slate-700">
                    {t("flatNo")} *
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t("flatNoPlaceholder")}
                      className="h-12 rounded-xl border-slate-300 text-base uppercase"
                      onBlur={(e) => {
                        field.onChange(e.target.value.toUpperCase());
                        field.onBlur();
                      }}
                    />
                  </FormControl>
                  {selectedBuilding?.flat_number_template && (
                    <p className="text-xs text-slate-400">
                      {t("flatNoFormat")} {selectedBuilding.flat_number_template.prefix ?? ""}
                      {"X".repeat(selectedBuilding.flat_number_template.floor_digits)}
                      {"N".repeat(selectedBuilding.flat_number_template.unit_digits)}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="owner_phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-slate-700">
                  {t("ownerPhone")} *
                </FormLabel>
                <FormControl>
                  <div className="flex items-center overflow-hidden rounded-xl border border-slate-300 focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
                    <span className="flex h-12 items-center bg-slate-100 px-3 text-base font-medium text-slate-500">
                      +91
                    </span>
                    <input
                      {...field}
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder={t("phonePlaceholder")}
                      className="h-12 flex-1 border-none bg-white px-3 text-base text-slate-900 outline-none"
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                        field.onChange(digits);
                      }}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="availability_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-slate-700">
                  {t("availability")} *
                </FormLabel>
                <FormControl>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: AVAILABILITY_TYPE.VACANT_NOW, label: t("vacantNow") },
                      { value: AVAILABILITY_TYPE.VACANT_FROM, label: t("vacantFrom") },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => field.onChange(opt.value)}
                        className={`flex h-12 items-center justify-center rounded-xl border-2 text-base font-medium transition-colors ${
                          field.value === opt.value
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {availabilityType === AVAILABILITY_TYPE.VACANT_FROM && (
            <FormField
              control={form.control}
              name="availability_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-slate-700">
                    {t("availableFrom")} *
                  </FormLabel>
                  <FormControl>
                    <DatePicker
                      value={field.value}
                      onChange={field.onChange}
                      minDate={todayStr}
                      className="h-12 rounded-xl border-slate-300 text-base"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="owner_consent_to_call"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-start gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    className="mt-0.5 size-5 shrink-0 accent-slate-900"
                  />
                  <FormLabel className="text-sm font-semibold leading-snug text-slate-800">
                    {t("consent")} *
                  </FormLabel>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <button
            type="button"
            onClick={() => setShowOptional(!showOptional)}
            className="flex w-full items-center justify-between rounded-lg py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            <span>{t("addMoreDetails")}</span>
            {showOptional ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>

          {showOptional && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <FormField
                control={form.control}
                name="owner_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-slate-700">
                      {t("ownerName")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("ownerNamePlaceholder")}
                        className="h-12 rounded-xl border-slate-300 text-base"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rent_expected"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-slate-700">
                      {t("rentExpected")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        inputMode="numeric"
                        placeholder={t("rentPlaceholder")}
                        className="h-12 rounded-xl border-slate-300 text-base"
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          field.onChange(val);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="furnishing"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-slate-700">
                      {t("furnishing")}
                    </FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-3 gap-2">
                        {furnishingOptions.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              field.onChange(field.value === opt.value ? undefined : opt.value)
                            }
                            className={`flex h-11 items-center justify-center rounded-xl border-2 text-sm font-medium transition-colors ${
                              field.value === opt.value
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-slate-700">
                      {t("notes")}
                    </FormLabel>
                    <FormControl>
                      <VoiceTextarea
                        {...field}
                        maxLength={500}
                        rows={3}
                        placeholder={t("notesPlaceholder")}
                        language={locale}
                        entityType="lead"
                        onValueChange={(v) => form.setValue("notes", v, { shouldDirty: true })}
                      />
                    </FormControl>
                    <div className="text-right text-xs text-slate-400">
                      {t("charCount", { count: notesValue.length, max: 500 })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting || isLimitReached || isDisabled}
            className="h-14 w-full rounded-xl bg-slate-900 text-base font-bold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="size-5 animate-spin" />
            ) : isDisabled ? (
              (disabledMessage ?? t("inactive"))
            ) : isLimitReached ? (
              t("limitReachedBtn")
            ) : remainingLeads?.remaining !== undefined ? (
              t("submitWithCount", { count: remainingLeads.remaining })
            ) : (
              t("submit")
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
