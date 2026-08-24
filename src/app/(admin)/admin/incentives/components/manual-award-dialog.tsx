"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  INCENTIVE_CARD_TYPE,
  INCENTIVE_LEVEL,
  USER_STATUS,
  type IncentiveCardType,
  type IncentiveLevel,
} from "../../../../../../lib/constants";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const CARD_TYPE_OPTIONS: { value: IncentiveCardType; label: string }[] = [
  { value: INCENTIVE_CARD_TYPE.LEAD_MILESTONE, label: "Lead Milestone" },
  { value: INCENTIVE_CARD_TYPE.VISIT_MILESTONE, label: "Visit Milestone" },
  { value: INCENTIVE_CARD_TYPE.QUALITY_STREAK, label: "Quality Streak" },
  { value: INCENTIVE_CARD_TYPE.SPEED_BONUS, label: "Speed Bonus" },
  { value: INCENTIVE_CARD_TYPE.MONTHLY_TOP, label: "Monthly Top" },
];

const LEVEL_OPTIONS: IncentiveLevel[] = [
  INCENTIVE_LEVEL.BRONZE,
  INCENTIVE_LEVEL.SILVER,
  INCENTIVE_LEVEL.GOLD,
  INCENTIVE_LEVEL.PLATINUM,
];

const manualAwardSchema = z.object({
  guard_user_id: z.string().min(1, "Select a guard"),
  card_type: z.union([
    z.literal(INCENTIVE_CARD_TYPE.LEAD_MILESTONE),
    z.literal(INCENTIVE_CARD_TYPE.VISIT_MILESTONE),
    z.literal(INCENTIVE_CARD_TYPE.QUALITY_STREAK),
    z.literal(INCENTIVE_CARD_TYPE.SPEED_BONUS),
    z.literal(INCENTIVE_CARD_TYPE.MONTHLY_TOP),
  ]),
  level: z.union([
    z.literal(INCENTIVE_LEVEL.BRONZE),
    z.literal(INCENTIVE_LEVEL.SILVER),
    z.literal(INCENTIVE_LEVEL.GOLD),
    z.literal(INCENTIVE_LEVEL.PLATINUM),
  ]),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().min(1, "Description is required"),
  badge_icon: z.string().trim().min(1, "Badge icon is required"),
  reward_amount_paise: z
    .string()
    .min(1, "Reward amount is required")
    .refine((value) => /^\d+$/.test(value), "Reward amount must be a whole number in paise"),
  reason: z.string().optional(),
});

type ManualAwardFormValues = z.infer<typeof manualAwardSchema>;

type ManualAwardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultGuardUserId?: Id<"users">;
  lockGuardSelection?: boolean;
};

export function ManualAwardDialog({
  open,
  onOpenChange,
  defaultGuardUserId,
  lockGuardSelection = false,
}: ManualAwardDialogProps) {
  const manualAward = useMutation(api.incentives.manualAward);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [guardSearch, setGuardSearch] = useState("");

  const guards = useQuery(
    api.guards.list,
    open
      ? {
          status: USER_STATUS.ACTIVE,
        }
      : "skip",
  );

  const form = useForm<ManualAwardFormValues>({
    resolver: zodResolver(manualAwardSchema),
    defaultValues: {
      guard_user_id: defaultGuardUserId ?? "",
      card_type: INCENTIVE_CARD_TYPE.LEAD_MILESTONE,
      level: INCENTIVE_LEVEL.BRONZE,
      title: "",
      description: "",
      badge_icon: "",
      reward_amount_paise: "0",
      reason: "",
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset({
      guard_user_id: defaultGuardUserId ?? "",
      card_type: INCENTIVE_CARD_TYPE.LEAD_MILESTONE,
      level: INCENTIVE_LEVEL.BRONZE,
      title: "",
      description: "",
      badge_icon: "",
      reward_amount_paise: "0",
      reason: "",
    });
    setGuardSearch("");
  }, [defaultGuardUserId, form, open]);

  const filteredGuards = useMemo(() => {
    if (!guards) {
      return [];
    }

    const normalized = guardSearch.trim().toLowerCase();
    if (!normalized) {
      return guards;
    }

    return guards.filter((guard) => {
      const haystack = `${guard.name} ${guard.phone ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [guardSearch, guards]);

  async function onSubmit(values: ManualAwardFormValues) {
    setIsSubmitting(true);

    try {
      await manualAward({
        guard_user_id: values.guard_user_id as Id<"users">,
        card_type: values.card_type,
        level: values.level,
        title: values.title.trim(),
        description: values.description.trim(),
        badge_icon: values.badge_icon.trim(),
        reward_amount_paise: Number(values.reward_amount_paise),
        reason: values.reason?.trim() || undefined,
      });

      toast.success("Card awarded!");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to award card");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Award Card</DialogTitle>
          <DialogDescription>
            Manually award an incentive card to an active guard.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="guard_user_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Guard *</FormLabel>
                  <div className="space-y-2">
                    {!lockGuardSelection && (
                      <Input
                        value={guardSearch}
                        onChange={(event) => setGuardSearch(event.target.value)}
                        placeholder="Search guard by name or phone"
                      />
                    )}
                    <FormControl>
                      <select
                        value={field.value}
                        onChange={field.onChange}
                        disabled={lockGuardSelection}
                        className={cn(
                          "flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2",
                          lockGuardSelection && "bg-slate-50 text-slate-600",
                        )}
                      >
                        <option value="">Select guard...</option>
                        {filteredGuards.map((guard) => (
                          <option key={guard.user_id} value={guard.user_id}>
                            {guard.name} ({guard.phone ?? "--"})
                          </option>
                        ))}
                      </select>
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="card_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Card Type *</FormLabel>
                    <FormControl>
                      <select
                        value={field.value}
                        onChange={field.onChange}
                        className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                      >
                        {CARD_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Level *</FormLabel>
                    <FormControl>
                      <select
                        value={field.value}
                        onChange={field.onChange}
                        className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                      >
                        {LEVEL_OPTIONS.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Gold Quality Streak" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Describe why this card is being awarded"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="badge_icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Badge Icon *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 🥇" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reward_amount_paise"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reward Amount (paise) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="e.g. 50000"
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
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Optional internal context" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Awarding...
                  </>
                ) : (
                  "Award Card"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
