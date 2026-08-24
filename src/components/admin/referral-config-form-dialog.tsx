"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  REFERRAL_CONFIG_SCOPE_TYPE,
  REFERRAL_TYPE,
  REFERRAL_TYPE_LABELS,
} from "../../../lib/constants";
import { paiseToRupees, rupeesToPaise } from "../../../lib/money";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const referralConfigFormSchema = z
  .object({
    referral_type: z.union([
      z.literal(REFERRAL_TYPE.GUARD),
      z.literal(REFERRAL_TYPE.TENANT_FINDING),
      z.literal(REFERRAL_TYPE.OWNER_FINDING),
    ]),
    scope_type: z.union([
      z.literal(REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL),
      z.literal(REFERRAL_CONFIG_SCOPE_TYPE.SOCIETY),
      z.literal(REFERRAL_CONFIG_SCOPE_TYPE.BUILDING),
    ]),
    scope_id: z.string().optional(),
    scope_society_id: z.string().optional(),
    sign_up_bonus_rupees: z.string().trim().min(1, "Enter sign-up bonus"),
    finding_bonus_total_rupees: z.string().trim().min(1, "Enter finding bonus total"),
    publish_split_pct: z.string().trim().min(1, "Enter publish split %"),
    closure_split_pct: z.string().trim().min(1, "Enter closure split %"),
    is_active: z.boolean(),
  })
  .superRefine((values, ctx) => {
    const signUpBonus = Number(values.sign_up_bonus_rupees);
    const findingBonusTotal = Number(values.finding_bonus_total_rupees);
    const publishSplit = Number(values.publish_split_pct);
    const closureSplit = Number(values.closure_split_pct);

    if (!Number.isInteger(signUpBonus) || signUpBonus < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["sign_up_bonus_rupees"],
        message: "Must be a whole number 0 or higher",
      });
    }

    if (!Number.isInteger(findingBonusTotal) || findingBonusTotal < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["finding_bonus_total_rupees"],
        message: "Must be a whole number 0 or higher",
      });
    }

    if (!Number.isInteger(publishSplit) || publishSplit < 0 || publishSplit > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["publish_split_pct"],
        message: "Must be an integer between 0 and 100",
      });
    }

    if (!Number.isInteger(closureSplit) || closureSplit < 0 || closureSplit > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["closure_split_pct"],
        message: "Must be an integer between 0 and 100",
      });
    }

    if (values.scope_type === REFERRAL_CONFIG_SCOPE_TYPE.SOCIETY && !values.scope_id) {
      ctx.addIssue({
        code: "custom",
        path: ["scope_id"],
        message: "Select a society",
      });
    }

    if (values.scope_type === REFERRAL_CONFIG_SCOPE_TYPE.BUILDING) {
      if (!values.scope_society_id) {
        ctx.addIssue({
          code: "custom",
          path: ["scope_society_id"],
          message: "Select a society",
        });
      }

      if (!values.scope_id) {
        ctx.addIssue({
          code: "custom",
          path: ["scope_id"],
          message: "Select a building",
        });
      }
    }

    if (
      Number.isInteger(publishSplit) &&
      Number.isInteger(closureSplit) &&
      publishSplit + closureSplit !== 100
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["closure_split_pct"],
        message: "Publish split % + Closure split % must equal 100",
      });
    }
  });

type ReferralConfigFormValues = z.infer<typeof referralConfigFormSchema>;

type ReferralConfigFormDialogProps = {
  open: boolean;
  openChangeAction: (open: boolean) => void;
  existingConfig: Doc<"referral_config"> | null;
  societies: Array<{ _id: Id<"societies">; name: string; city: string }>;
};

function getDefaultValues(existingConfig: Doc<"referral_config"> | null): ReferralConfigFormValues {
  return {
    referral_type: existingConfig?.referral_type ?? REFERRAL_TYPE.GUARD,
    scope_type: existingConfig?.scope_type ?? REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL,
    scope_id: existingConfig?.scope_id,
    scope_society_id: undefined,
    sign_up_bonus_rupees: String(paiseToRupees(existingConfig?.sign_up_bonus ?? 0)),
    finding_bonus_total_rupees: String(paiseToRupees(existingConfig?.finding_bonus_total ?? 0)),
    publish_split_pct: String(existingConfig?.publish_split_pct ?? 50),
    closure_split_pct: String(existingConfig?.closure_split_pct ?? 50),
    is_active: existingConfig?.is_active ?? true,
  };
}

export function ReferralConfigFormDialog({
  open,
  openChangeAction,
  existingConfig,
  societies,
}: ReferralConfigFormDialogProps) {
  const upsertReferralConfig = useMutation(api.referralConfig.upsert);

  const form = useForm<ReferralConfigFormValues>({
    resolver: zodResolver(referralConfigFormSchema),
    defaultValues: getDefaultValues(existingConfig),
  });

  const scopeType = form.watch("scope_type");
  const selectedSocietyForBuilding = form.watch("scope_society_id");
  const selectedBuildingId = form.watch("scope_id");

  const selectedBuilding = useQuery(
    api.buildings.getById,
    scopeType === REFERRAL_CONFIG_SCOPE_TYPE.BUILDING && selectedBuildingId
      ? { id: selectedBuildingId as Id<"buildings"> }
      : "skip",
  );

  const buildingOptions = useQuery(
    api.buildings.listBySociety,
    scopeType === REFERRAL_CONFIG_SCOPE_TYPE.BUILDING && selectedSocietyForBuilding
      ? { society_id: selectedSocietyForBuilding as Id<"societies"> }
      : "skip",
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset(getDefaultValues(existingConfig));
  }, [existingConfig, form, open]);

  useEffect(() => {
    if (
      scopeType === REFERRAL_CONFIG_SCOPE_TYPE.BUILDING &&
      selectedBuilding &&
      !form.getValues("scope_society_id")
    ) {
      form.setValue("scope_society_id", selectedBuilding.society_id);
    }
  }, [form, scopeType, selectedBuilding]);

  async function onSubmit(values: ReferralConfigFormValues) {
    const scopeId =
      values.scope_type === REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL ? undefined : values.scope_id;

    try {
      const signUpBonusRupees = Number(values.sign_up_bonus_rupees);
      const findingBonusTotalRupees = Number(values.finding_bonus_total_rupees);
      const publishSplit = Number(values.publish_split_pct);
      const closureSplit = Number(values.closure_split_pct);

      await upsertReferralConfig({
        referral_type: values.referral_type,
        scope_type: values.scope_type,
        scope_id: scopeId,
        sign_up_bonus: rupeesToPaise(signUpBonusRupees),
        finding_bonus_total: rupeesToPaise(findingBonusTotalRupees),
        publish_split_pct: publishSplit,
        closure_split_pct: closureSplit,
        is_active: values.is_active,
      });

      toast.success(existingConfig ? "Referral config updated" : "Referral config created");
      openChangeAction(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save referral config");
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={openChangeAction}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {existingConfig ? "Edit Referral Config" : "Add Referral Config"}
          </DialogTitle>
          <DialogDescription>
            Configure referral bonus splits and scope for this referral type.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="referral_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referral Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(REFERRAL_TYPE).map((referralType) => (
                          <SelectItem key={referralType} value={referralType}>
                            {REFERRAL_TYPE_LABELS[referralType]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="scope_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scope Type</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);

                        if (value === REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL) {
                          form.setValue("scope_id", undefined);
                          form.setValue("scope_society_id", undefined);
                        }

                        if (value === REFERRAL_CONFIG_SCOPE_TYPE.SOCIETY) {
                          form.setValue("scope_society_id", undefined);
                        }

                        if (value === REFERRAL_CONFIG_SCOPE_TYPE.BUILDING) {
                          form.setValue("scope_id", undefined);
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select scope" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={REFERRAL_CONFIG_SCOPE_TYPE.GLOBAL}>Global</SelectItem>
                        <SelectItem value={REFERRAL_CONFIG_SCOPE_TYPE.SOCIETY}>Society</SelectItem>
                        <SelectItem value={REFERRAL_CONFIG_SCOPE_TYPE.BUILDING}>
                          Building
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {scopeType === REFERRAL_CONFIG_SCOPE_TYPE.SOCIETY ? (
              <FormField
                control={form.control}
                name="scope_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Society</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select society" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {societies.map((society) => (
                          <SelectItem key={society._id} value={society._id}>
                            {society.name} - {society.city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {scopeType === REFERRAL_CONFIG_SCOPE_TYPE.BUILDING ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="scope_society_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Society</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue("scope_id", undefined);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select society" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {societies.map((society) => (
                            <SelectItem key={society._id} value={society._id}>
                              {society.name} - {society.city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scope_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Building</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!selectedSocietyForBuilding}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select building" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(buildingOptions ?? []).map((building) => (
                            <SelectItem key={building._id} value={building._id}>
                              {building.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sign_up_bonus_rupees"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sign-up Bonus (Rs)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="finding_bonus_total_rupees"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Finding Bonus Total (Rs)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="publish_split_pct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Publish Split %</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="closure_split_pct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Closure Split %</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                  <FormLabel className="mb-0">Active</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => openChangeAction(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : existingConfig ? (
                  "Update Config"
                ) : (
                  "Create Config"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
