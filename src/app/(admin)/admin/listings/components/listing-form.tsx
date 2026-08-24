"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  AMENITIES,
  AVAILABILITY_TYPE,
  BHK_CONFIG,
  FURNISHING,
  LEAD_STATUS,
  LISTING_STATUS,
  PARKING,
  PERMISSIONS,
} from "../../../../../../lib/constants";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PhotoUploader } from "./photo-uploader";
import { PhotoManager } from "./photo-manager";

const BHK_OPTIONS = [
  { value: BHK_CONFIG["1BHK"], label: "1 BHK" },
  { value: BHK_CONFIG["2BHK"], label: "2 BHK" },
  { value: BHK_CONFIG["3BHK"], label: "3 BHK" },
  { value: BHK_CONFIG["4BHK"], label: "4 BHK" },
  { value: BHK_CONFIG.STUDIO, label: "Studio" },
  { value: BHK_CONFIG.OTHER, label: "Other" },
];

const FURNISHING_OPTIONS = [
  { value: FURNISHING.UNFURNISHED, label: "Unfurnished" },
  { value: FURNISHING.SEMI_FURNISHED, label: "Semi-Furnished" },
  { value: FURNISHING.FULLY_FURNISHED, label: "Fully Furnished" },
];

const PARKING_OPTIONS = [
  { value: PARKING.NONE, label: "None" },
  { value: PARKING.COVERED, label: "Covered" },
  { value: PARKING.OPEN, label: "Open" },
  { value: PARKING.BOTH, label: "Both" },
];

const AMENITY_LABELS: Record<string, string> = {
  gym: "Gym",
  pool: "Pool",
  garden: "Garden",
  security: "Security",
  lift: "Lift",
  power_backup: "Power Backup",
  clubhouse: "Clubhouse",
  parking: "Parking",
  play_area: "Play Area",
  jogging_track: "Jogging Track",
  intercom: "Intercom",
  cctv: "CCTV",
  fire_safety: "Fire Safety",
  water_supply_24x7: "24/7 Water",
  gas_pipeline: "Gas Pipeline",
  rain_water_harvesting: "Rainwater Harvesting",
};

const listingFormSchema = z.object({
  lead_id: z.string().min(1, "Select a verified lead"),
  rent_monthly: z
    .string()
    .min(1, "Rent is required")
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Must be a positive number"),
  bhk_config: z.string().min(1, "BHK config is required"),
  furnishing: z.string().min(1, "Furnishing is required"),
  floor_number: z.string().min(1, "Floor number is required"),
  available_from: z.string().min(1, "Available from date is required"),
  deposit: z.string().optional(),
  maintenance: z.string().optional(),
  carpet_area_sqft: z.string().optional(),
  description: z.string().optional(),
  parking: z.string().optional(),
  pet_friendly: z.boolean().optional(),
  amenities: z.array(z.string()).optional(),
});

type ListingFormValues = z.infer<typeof listingFormSchema>;

type ListingFormProps = {
  mode: "create" | "edit";
  listingId?: Id<"listings">;
  onSuccess?: () => void;
};

export function ListingForm({ mode, listingId, onSuccess }: ListingFormProps) {
  const createListing = useMutation(api.listings.create);
  const updateListing = useMutation(api.listings.update);
  const publishListing = useMutation(api.listings.publish);

  const existingListing = useQuery(
    api.listings.getById,
    mode === "edit" && listingId ? { listing_id: listingId } : "skip",
  );

  const verifiedLeads = useQuery(api.leads.list, {
    paginationOpts: { numItems: 100, cursor: null },
    status: LEAD_STATUS.VERIFIED,
  });

  const existingListings = useQuery(api.listings.list, {
    paginationOpts: { numItems: 200, cursor: null },
  });

  const availableLeads = useMemo(() => {
    if (!verifiedLeads?.page || !existingListings?.page) return [];
    const listingLeadIds = new Set(existingListings.page.map((l) => l.lead_id));
    return verifiedLeads.page.filter((lead) => {
      if (mode === "edit" && existingListing?.lead_id === lead._id) return true;
      return !listingLeadIds.has(lead._id);
    });
  }, [verifiedLeads, existingListings, mode, existingListing]);

  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const selectedLeadDetail = useQuery(
    api.leads.getById,
    selectedLeadId ? { lead_id: selectedLeadId as Id<"leads"> } : "skip",
  );

  const [photoCount, setPhotoCount] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);

  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: {
      lead_id: "",
      rent_monthly: "",
      bhk_config: "",
      furnishing: "",
      floor_number: "",
      available_from: "",
      deposit: "",
      maintenance: "",
      carpet_area_sqft: "",
      description: "",
      parking: "",
      pet_friendly: false,
      amenities: [],
    },
  });

  // Pre-fill from existing listing in edit mode
  useEffect(() => {
    if (mode === "edit" && existingListing) {
      form.reset({
        lead_id: existingListing.lead_id,
        rent_monthly: paiseToRupees(existingListing.rent_monthly).toString(),
        bhk_config: existingListing.bhk_config,
        furnishing: existingListing.furnishing,
        floor_number: existingListing.floor_number,
        available_from: new Date(existingListing.available_from).toISOString().split("T")[0],
        deposit: existingListing.deposit ? paiseToRupees(existingListing.deposit).toString() : "",
        maintenance: existingListing.maintenance
          ? paiseToRupees(existingListing.maintenance).toString()
          : "",
        carpet_area_sqft: existingListing.carpet_area_sqft
          ? existingListing.carpet_area_sqft.toString()
          : "",
        description: existingListing.description ?? "",
        parking: existingListing.parking ?? "",
        pet_friendly: existingListing.pet_friendly ?? false,
        amenities: (existingListing.amenities as string[]) ?? [],
      });
      setSelectedLeadId(existingListing.lead_id);
      setPhotoCount(existingListing.photo_count);
    }
  }, [existingListing, form, mode]);

  // Pre-fill from lead selection in create mode
  useEffect(() => {
    if (mode !== "create" || !selectedLeadDetail) return;

    const updates: Partial<ListingFormValues> = {};

    if (selectedLeadDetail.rent_expected) {
      updates.rent_monthly = paiseToRupees(selectedLeadDetail.rent_expected).toString();
    }

    if (selectedLeadDetail.furnishing) {
      updates.furnishing = selectedLeadDetail.furnishing;
    }

    if (selectedLeadDetail.floor_number) {
      updates.floor_number = selectedLeadDetail.floor_number;
    }

    if (
      selectedLeadDetail.availability_type === AVAILABILITY_TYPE.VACANT_FROM &&
      selectedLeadDetail.availability_date
    ) {
      updates.available_from = new Date(selectedLeadDetail.availability_date)
        .toISOString()
        .split("T")[0];
    }

    // BHK is NEVER pre-filled
    for (const [key, value] of Object.entries(updates)) {
      form.setValue(key as keyof ListingFormValues, value as string);
    }
  }, [selectedLeadDetail, mode, form]);

  const handleLeadChange = useCallback(
    (leadId: string) => {
      setSelectedLeadId(leadId);
      form.setValue("lead_id", leadId);
    },
    [form],
  );

  const toggleAmenity = useCallback(
    (amenity: string) => {
      const current = form.getValues("amenities") ?? [];
      const updated = current.includes(amenity)
        ? current.filter((a) => a !== amenity)
        : [...current, amenity];
      form.setValue("amenities", updated);
    },
    [form],
  );

  const isSubmitting = form.formState.isSubmitting || isPublishing;

  async function buildPayload(values: ListingFormValues) {
    const rentPaise = rupeesToPaise(Number(values.rent_monthly));
    const depositPaise = values.deposit ? rupeesToPaise(Number(values.deposit)) : undefined;
    const maintenancePaise = values.maintenance
      ? rupeesToPaise(Number(values.maintenance))
      : undefined;
    const carpetArea = values.carpet_area_sqft ? Number(values.carpet_area_sqft) : undefined;
    const availableFromMs = new Date(values.available_from).getTime();
    const amenitiesPayload =
      values.amenities && values.amenities.length > 0
        ? (values.amenities as (typeof AMENITIES)[number][])
        : undefined;
    const parkingValue = values.parking || undefined;

    return {
      rent_monthly: rentPaise,
      bhk_config: values.bhk_config as (typeof BHK_CONFIG)[keyof typeof BHK_CONFIG],
      furnishing: values.furnishing as (typeof FURNISHING)[keyof typeof FURNISHING],
      floor_number: values.floor_number,
      available_from: availableFromMs,
      deposit: depositPaise,
      maintenance: maintenancePaise,
      carpet_area_sqft: carpetArea,
      description: values.description || undefined,
      parking: parkingValue as (typeof PARKING)[keyof typeof PARKING] | undefined,
      pet_friendly: values.pet_friendly,
      amenities: amenitiesPayload,
    };
  }

  async function onSaveDraft(values: ListingFormValues) {
    try {
      const payload = await buildPayload(values);

      if (mode === "create") {
        await createListing({
          lead_id: values.lead_id as Id<"leads">,
          ...payload,
        });
        toast.success("Listing saved as draft");
      } else if (listingId) {
        await updateListing({
          listing_id: listingId,
          ...payload,
        });
        toast.success("Listing updated");
      }

      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save listing");
    }
  }

  async function onSaveAndPublish(values: ListingFormValues) {
    setIsPublishing(true);
    try {
      const payload = await buildPayload(values);

      let targetListingId = listingId;

      if (mode === "create") {
        targetListingId = await createListing({
          lead_id: values.lead_id as Id<"leads">,
          ...payload,
        });
      } else if (listingId) {
        await updateListing({
          listing_id: listingId,
          ...payload,
        });
      }

      if (targetListingId) {
        await publishListing({
          listing_id: targetListingId,
          new_status: LISTING_STATUS.PUBLISHED,
        });
      }

      toast.success("Listing published!");
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish listing");
    } finally {
      setIsPublishing(false);
    }
  }

  const watchedAmenities = form.watch("amenities") ?? [];
  const effectiveListingId = mode === "edit" ? listingId : undefined;

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
        {/* 1. Lead Selector */}
        <FormField
          control={form.control}
          name="lead_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Verified Lead *</FormLabel>
              <FormControl>
                <Select
                  value={field.value || undefined}
                  onValueChange={handleLeadChange}
                  disabled={mode === "edit"}
                >
                  <SelectTrigger className="h-10 w-full rounded-md">
                    <SelectValue placeholder="Select a verified lead..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLeads.map((lead) => (
                      <SelectItem key={lead._id} value={lead._id}>
                        {lead.building_name ?? "—"} / Fl{lead.floor_number} / {lead.flat_number} —{" "}
                        {lead.society_name ?? "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 2. Rent */}
        <FormField
          control={form.control}
          name="rent_monthly"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Monthly Rent (₹) *</FormLabel>
              <FormControl>
                <Input type="number" min={0} step={1} placeholder="25000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 3. BHK Config */}
        <FormField
          control={form.control}
          name="bhk_config"
          render={({ field }) => (
            <FormItem>
              <FormLabel>BHK Config *</FormLabel>
              <FormControl>
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger className="h-10 w-full rounded-md">
                    <SelectValue placeholder="Select BHK..." />
                  </SelectTrigger>
                  <SelectContent>
                    {BHK_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 4. Furnishing */}
        <FormField
          control={form.control}
          name="furnishing"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Furnishing *</FormLabel>
              <FormControl>
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger className="h-10 w-full rounded-md">
                    <SelectValue placeholder="Select furnishing..." />
                  </SelectTrigger>
                  <SelectContent>
                    {FURNISHING_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 5. Floor */}
        <FormField
          control={form.control}
          name="floor_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Floor *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. 12" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 6. Available From */}
        <FormField
          control={form.control}
          name="available_from"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Available From *</FormLabel>
              <FormControl>
                <DatePicker value={field.value} onChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 7. Photos Section */}
        {effectiveListingId && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Photos</Label>
            <PhotoUploader
              listingId={effectiveListingId}
              currentPhotoCount={photoCount}
              onPhotoCountChange={setPhotoCount}
            />
            <PhotoManager listingId={effectiveListingId} onPhotoCountChange={setPhotoCount} />
          </div>
        )}
        {mode === "create" && (
          <p className="text-xs text-slate-500">
            Save as draft first, then add photos from the listing detail page.
          </p>
        )}

        {/* 8. Deposit */}
        <FormField
          control={form.control}
          name="deposit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deposit (₹)</FormLabel>
              <FormControl>
                <Input type="number" min={0} step={1} placeholder="50000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 9. Maintenance */}
        <FormField
          control={form.control}
          name="maintenance"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Maintenance (₹/month)</FormLabel>
              <FormControl>
                <Input type="number" min={0} step={1} placeholder="3000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 10. Carpet Area */}
        <FormField
          control={form.control}
          name="carpet_area_sqft"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Carpet Area (sq ft)</FormLabel>
              <FormControl>
                <Input type="number" min={0} step={1} placeholder="850" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 11. Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={4} placeholder="Describe the property..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 12. Parking */}
        <FormField
          control={form.control}
          name="parking"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Parking</FormLabel>
              <FormControl>
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger className="h-10 w-full rounded-md">
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    {PARKING_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 13. Pet Friendly */}
        <FormField
          control={form.control}
          name="pet_friendly"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <FormLabel className="cursor-pointer">Pet Friendly</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {/* 14. Amenities */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Amenities</Label>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map((amenity) => {
              const isSelected = watchedAmenities.includes(amenity);
              return (
                <button
                  key={amenity}
                  type="button"
                  onClick={() => toggleAmenity(amenity)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {AMENITY_LABELS[amenity] ?? amenity}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={form.handleSubmit(onSaveDraft)}
            className="flex-1"
          >
            {isSubmitting && !isPublishing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : mode === "create" ? (
              "Save as Draft"
            ) : (
              "Save Changes"
            )}
          </Button>

          {(mode === "create" ||
            (existingListing && existingListing.status === LISTING_STATUS.DRAFT)) && (
            <Button
              type="button"
              disabled={isSubmitting || (mode === "edit" && photoCount < 1)}
              onClick={form.handleSubmit(onSaveAndPublish)}
              className="flex-1 bg-slate-900 text-white hover:bg-slate-800"
              title={
                mode === "edit" && photoCount < 1
                  ? "Add at least 1 photo before publishing"
                  : undefined
              }
            >
              {isPublishing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                "Save & Publish"
              )}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
