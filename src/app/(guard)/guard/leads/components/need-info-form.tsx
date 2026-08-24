"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Loader2, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { AVAILABILITY_TYPE, FURNISHING } from "../../../../../../lib/constants";
import { paiseToRupees, rupeesToPaise } from "../../../../../../lib/money";
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
import { DatePicker } from "@/components/ui/date-picker";
import { VoiceTextarea } from "@/components/shared/voice-textarea";
import { useLocale } from "next-intl";

type LeadData = {
  _id: Id<"leads">;
  building_name: string | undefined;
  floor_number: string;
  flat_number: string;
  owner_phone: string;
  owner_name?: string;
  rent_expected?: number;
  furnishing?: string;
  availability_type: string;
  availability_date?: number;
  notes?: string;
  notes_thread: Array<{
    note: string;
    author_id: Id<"users">;
    author_name: string;
    author_type: "ADMIN" | "GUARD" | "OPS";
    timestamp: number;
  }>;
};

type NeedInfoFormProps = {
  lead: LeadData;
};

const FURNISHING_OPTIONS = [
  FURNISHING.UNFURNISHED,
  FURNISHING.SEMI_FURNISHED,
  FURNISHING.FULLY_FURNISHED,
] as const;

export function NeedInfoForm({ lead }: NeedInfoFormProps) {
  const t = useTranslations("guard.leads");
  const tSubmitLead = useTranslations("guard.submitLead");
  const tCommon = useTranslations("guard.common");
  const locale = useLocale();
  const router = useRouter();
  const updateByGuard = useMutation(api.leads.updateByGuard);
  const needInfoSchema = z.object({
    owner_phone: z.string().regex(/^\d{10}$/, tSubmitLead("phoneInvalid")),
    owner_name: z.string().optional(),
    rent_expected: z.string().optional(),
    furnishing: z
      .enum([FURNISHING.UNFURNISHED, FURNISHING.SEMI_FURNISHED, FURNISHING.FULLY_FURNISHED])
      .optional(),
    availability_type: z.enum([AVAILABILITY_TYPE.VACANT_NOW, AVAILABILITY_TYPE.VACANT_FROM]),
    availability_date: z.string().optional(),
    notes: z
      .string()
      .max(500, t("maxChars", { max: 500 }))
      .optional(),
    reply_note: z
      .string()
      .max(500, t("maxChars", { max: 500 }))
      .optional(),
  });

  type NeedInfoValues = z.infer<typeof needInfoSchema>;

  const latestAdminNote = lead.notes_thread.filter((n) => n.author_type === "ADMIN").at(-1);
  const furnishingOptions = FURNISHING_OPTIONS.map((value) => ({
    value,
    label:
      value === FURNISHING.UNFURNISHED
        ? t("unfurnished")
        : value === FURNISHING.SEMI_FURNISHED
          ? t("semi")
          : t("fully"),
  }));

  const rentInRupees =
    lead.rent_expected !== undefined ? String(Math.round(paiseToRupees(lead.rent_expected))) : "";

  const availabilityDateStr = lead.availability_date
    ? new Date(lead.availability_date).toISOString().split("T")[0]
    : "";

  const form = useForm<NeedInfoValues>({
    resolver: zodResolver(needInfoSchema),
    defaultValues: {
      owner_phone: lead.owner_phone,
      owner_name: lead.owner_name ?? "",
      rent_expected: rentInRupees,
      furnishing: (lead.furnishing as NeedInfoValues["furnishing"]) ?? undefined,
      availability_type: lead.availability_type as NeedInfoValues["availability_type"],
      availability_date: availabilityDateStr,
      notes: lead.notes ?? "",
      reply_note: "",
    },
    mode: "onBlur",
  });

  const isSubmitting = form.formState.isSubmitting;
  const availabilityType = form.watch("availability_type");
  const todayStr = new Date().toISOString().split("T")[0];

  async function onSubmit(values: NeedInfoValues) {
    try {
      const rentInPaise =
        values.rent_expected && values.rent_expected.trim()
          ? rupeesToPaise(Number(values.rent_expected))
          : undefined;

      let availabilityDate: number | undefined;
      if (values.availability_type === AVAILABILITY_TYPE.VACANT_FROM && values.availability_date) {
        availabilityDate = new Date(values.availability_date).getTime();
      }

      await updateByGuard({
        lead_id: lead._id,
        owner_phone: values.owner_phone,
        owner_name: values.owner_name?.trim() || undefined,
        rent_expected: rentInPaise,
        furnishing: values.furnishing || undefined,
        availability_type: values.availability_type,
        availability_date: availabilityDate,
        notes: values.notes?.trim() || undefined,
        reply_note: values.reply_note?.trim() || undefined,
      });

      toast.success(t("resubmitSuccess"));
      router.push("/guard/leads");
    } catch (error) {
      const message = error instanceof Error ? error.message : tCommon("error");
      toast.error(message);
    }
  }

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-amber-700">
        <MessageCircle className="size-4" />
        {t("respondHeader")}
      </h3>

      {latestAdminNote && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-white px-3.5 py-3">
          <p className="text-xs font-semibold uppercase text-amber-600">{t("adminRequested")}</p>
          <p className="mt-1 text-sm font-medium text-slate-800">
            &ldquo;{latestAdminNote.note}&rdquo;
          </p>
        </div>
      )}

      <div className="mb-4 rounded-lg bg-white/70 px-3 py-2.5 text-sm text-slate-600">
        <span className="font-semibold text-slate-700">
          {t("buildingFloor", {
            building: lead.building_name ?? tSubmitLead("building"),
            floor: lead.floor_number,
          })}
          , #{lead.flat_number}
        </span>
        <span className="ml-1 text-slate-400">({t("notEditable")})</span>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <FormField
            control={form.control}
            name="owner_phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-slate-700">
                  {t("ownerPhone")}
                </FormLabel>
                <FormControl>
                  <div className="flex items-center overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
                    <span className="flex h-11 items-center bg-slate-100 px-3 text-sm font-medium text-slate-500">
                      +91
                    </span>
                    <input
                      {...field}
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder={tSubmitLead("phonePlaceholder")}
                      className="h-11 flex-1 border-none bg-white px-3 text-base text-slate-900 outline-none"
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
                    className="h-11 rounded-xl border-slate-300 bg-white text-base"
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
                    className="h-11 rounded-xl border-slate-300 bg-white text-base"
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
                        className={`flex h-10 items-center justify-center rounded-xl border-2 text-sm font-medium transition-colors ${
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
            name="availability_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-slate-700">
                  {t("availabilityLabel")}
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
                        className={`flex h-10 items-center justify-center rounded-xl border-2 text-sm font-medium transition-colors ${
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
                    {t("availableFrom")}
                  </FormLabel>
                  <FormControl>
                    <DatePicker
                      value={field.value}
                      onChange={field.onChange}
                      minDate={todayStr}
                      className="h-11 rounded-xl border-slate-300 bg-white text-base"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-slate-700">
                  {t("notesLabel")}
                </FormLabel>
                <FormControl>
                  <VoiceTextarea
                    {...field}
                    maxLength={500}
                    rows={2}
                    language={locale}
                    entityType="lead"
                    entityId={lead._id}
                    onValueChange={(v) => form.setValue("notes", v, { shouldDirty: true })}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="reply_note"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-slate-700">
                  {t("replyNotes")}
                </FormLabel>
                <FormControl>
                  <VoiceTextarea
                    {...field}
                    maxLength={500}
                    rows={2}
                    placeholder={t("replyPlaceholder")}
                    language={locale}
                    entityType="lead"
                    entityId={lead._id}
                    onValueChange={(v) => form.setValue("reply_note", v, { shouldDirty: true })}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-12 w-full rounded-xl bg-slate-900 text-base font-bold text-white hover:bg-slate-800"
          >
            {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : t("updateResubmit")}
          </Button>
        </form>
      </Form>
    </div>
  );
}
