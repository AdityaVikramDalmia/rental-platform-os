"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, Square } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { INCENTIVE_PERSONA, WEEKLY_TIER_THRESHOLDS, XP_AWARDS } from "../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
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

const PERSONA_OPTIONS = [
  INCENTIVE_PERSONA.GUARD,
  INCENTIVE_PERSONA.OPS,
  INCENTIVE_PERSONA.SALES,
  INCENTIVE_PERSONA.RM,
  INCENTIVE_PERSONA.LIAISON,
  INCENTIVE_PERSONA.ALL,
] as const;

const XP_AWARD_ENTRIES = Object.entries(XP_AWARDS);
const TIER_ENTRIES = Object.entries(WEEKLY_TIER_THRESHOLDS);

const questFormSchema = z
  .object({
    quest_code: z.string().trim().min(1, "Quest code is required"),
    applicable_personas: z.array(z.enum(PERSONA_OPTIONS)).min(1, "Select at least one persona"),
    scope: z.enum(["INDIVIDUAL", "TEAM"]),
    target_metric_key: z.string().trim().min(1, "Metric key is required"),
    target_value: z.number().int().min(1, "Must be at least 1"),
    reward_type: z.enum(["XP", "PAISE", "PERK"]),
    reward_value: z.number().int().min(1, "Must be at least 1"),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().min(1, "End date is required"),
  })
  .refine(
    (data) => {
      if (!data.start_date || !data.end_date) return true;
      return new Date(data.end_date).getTime() > new Date(data.start_date).getTime();
    },
    { message: "End date must be after start date", path: ["end_date"] },
  );

type QuestFormValues = z.infer<typeof questFormSchema>;

type GamificationTabProps = {
  canConfigure: boolean;
};

function QuestStatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") {
    return <Badge className="bg-emerald-100 text-emerald-700">ACTIVE</Badge>;
  }
  return <Badge className="bg-slate-100 text-slate-600">ENDED</Badge>;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function GamificationTab({ canConfigure }: GamificationTabProps) {
  const quests = useQuery(api.gamification.listQuests, {});
  const profiles = useQuery(api.gamification.listProfiles, {});

  const createQuestMut = useMutation(api.gamification.createQuest);
  const endQuestMut = useMutation(api.gamification.endQuest);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [endingQuestId, setEndingQuestId] = useState<string | null>(null);

  const form = useForm<QuestFormValues>({
    resolver: zodResolver(questFormSchema),
    defaultValues: {
      quest_code: "",
      applicable_personas: [],
      scope: "INDIVIDUAL",
      target_metric_key: "",
      target_value: 1,
      reward_type: "XP",
      reward_value: 1,
      start_date: "",
      end_date: "",
    },
  });

  async function onSubmitQuest(values: QuestFormValues) {
    setIsSubmitting(true);
    try {
      await createQuestMut({
        quest_code: values.quest_code,
        applicable_personas: [...values.applicable_personas],
        scope: values.scope,
        target_metric_key: values.target_metric_key,
        target_value: values.target_value,
        reward_type: values.reward_type,
        reward_value: values.reward_value,
        start_at: new Date(values.start_date + "T00:00:00").getTime(),
        end_at: new Date(values.end_date + "T23:59:59").getTime(),
      });
      toast.success("Quest created");
      setIsCreateOpen(false);
      form.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create quest");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEndQuest(questId: Id<"gamification_quests">) {
    setEndingQuestId(questId);
    try {
      await endQuestMut({ id: questId });
      toast.success("Quest ended");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to end quest");
    } finally {
      setEndingQuestId(null);
    }
  }

  if (quests === undefined || profiles === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">XP & Level Configuration</CardTitle>
          <CardDescription>
            Read-only reference for XP awards, level curve, and weekly tier thresholds. Adjust via
            the Program tab&apos;s config JSON.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="mb-2 text-sm font-medium text-slate-900">XP Awards</h4>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 text-right font-medium">XP</th>
                  </tr>
                </thead>
                <tbody>
                  {XP_AWARD_ENTRIES.map(([action, xp]) => (
                    <tr key={action} className="border-b border-slate-100 text-slate-700">
                      <td className="px-3 py-2 font-mono text-xs">{action}</td>
                      <td className="px-3 py-2 text-right font-medium">{xp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-slate-900">Level Curve</h4>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>
                <strong>L &le; 10:</strong> 100 &times; L XP per level
              </p>
              <p>
                <strong>11 &le; L &le; 30:</strong> 1,000 + (L &minus; 10) &times; 75 XP per level
              </p>
              <p>
                <strong>L &gt; 30:</strong> 2,500 + &lfloor;(L &minus; 30)
                <sup>1.5</sup>&rfloor; &times; 50 XP per level
              </p>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-slate-900">Weekly Tier Thresholds</h4>
            <div className="flex flex-wrap gap-3">
              {TIER_ENTRIES.map(([tier, threshold]) => (
                <div
                  key={tier}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-center"
                >
                  <p className="text-xs text-slate-500">{tier}</p>
                  <p className="text-sm font-semibold text-slate-900">
                    &ge; {threshold as number} XP
                  </p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg text-slate-900">Quest Management</CardTitle>
            <CardDescription>
              Create, view, and end quests for gamification challenges.
            </CardDescription>
          </div>
          {canConfigure ? (
            <Button
              type="button"
              onClick={() => {
                form.reset();
                setIsCreateOpen(true);
              }}
            >
              <Plus className="size-4" />
              Create Quest
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {quests.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No quests found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-2.5 font-medium">Code</th>
                    <th className="px-3 py-2.5 font-medium">Personas</th>
                    <th className="px-3 py-2.5 font-medium">Scope</th>
                    <th className="px-3 py-2.5 font-medium">Metric</th>
                    <th className="px-3 py-2.5 font-medium">Target</th>
                    <th className="px-3 py-2.5 font-medium">Reward</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Start</th>
                    <th className="px-3 py-2.5 font-medium">End</th>
                    <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {quests.map((quest) => (
                    <tr key={quest._id} className="border-b border-slate-100 text-slate-700">
                      <td className="px-3 py-2.5 font-medium text-slate-900">{quest.quest_code}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {quest.applicable_personas.map((p) => (
                            <Badge key={p} variant="outline" className="text-xs">
                              {p}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{quest.scope}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{quest.target_metric_key}</td>
                      <td className="px-3 py-2.5 text-right">{quest.target_value}</td>
                      <td className="px-3 py-2.5">
                        {quest.reward_value}{" "}
                        <span className="text-slate-500">{quest.reward_type}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <QuestStatusBadge status={quest.status} />
                      </td>
                      <td className="px-3 py-2.5 text-xs">{formatDate(quest.start_at)}</td>
                      <td className="px-3 py-2.5 text-xs">{formatDate(quest.end_at)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {canConfigure && quest.status === "ACTIVE" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={endingQuestId === quest._id}
                            onClick={() => handleEndQuest(quest._id)}
                          >
                            {endingQuestId === quest._id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Square className="size-3.5" />
                            )}
                            End
                          </Button>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Active Profiles</CardTitle>
          <CardDescription>All active gamification profiles across personas.</CardDescription>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No active profiles found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-2.5 font-medium">User</th>
                    <th className="px-3 py-2.5 font-medium">Persona</th>
                    <th className="px-3 py-2.5 font-medium">Level</th>
                    <th className="px-3 py-2.5 font-medium">XP Total</th>
                    <th className="px-3 py-2.5 font-medium">Weekly Tier</th>
                    <th className="px-3 py-2.5 font-medium">Weekly XP</th>
                    <th className="px-3 py-2.5 font-medium">Streak</th>
                    <th className="px-3 py-2.5 font-medium">Badges</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => (
                    <tr key={profile._id} className="border-b border-slate-100 text-slate-700">
                      <td className="px-3 py-2.5">
                        <div>
                          <p className="font-medium text-slate-900">{profile.user_name}</p>
                          {profile.user_email ? (
                            <p className="text-xs text-slate-500">{profile.user_email}</p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline">{profile.persona}</Badge>
                      </td>
                      <td className="px-3 py-2.5 font-medium">{profile.level}</td>
                      <td className="px-3 py-2.5 text-right">
                        {profile.xp_total.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge className="bg-amber-100 text-amber-700">{profile.weekly_tier}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {profile.weekly_xp.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5">{profile.streak_days}d</td>
                      <td className="px-3 py-2.5">
                        {profile.badges.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {profile.badges.map((badge) => (
                              <Badge key={badge} variant="secondary" className="text-xs">
                                {badge}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            form.reset();
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Quest</DialogTitle>
            <DialogDescription>
              Define a new quest challenge with target metrics and rewards.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitQuest)} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="quest_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quest Code</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g. WEEKLY_LEAD_RUSH"
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="applicable_personas"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Applicable Personas</FormLabel>
                    <div className="grid grid-cols-3 gap-3">
                      {PERSONA_OPTIONS.map((persona) => (
                        <label key={persona} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={field.value.includes(persona)}
                            disabled={isSubmitting}
                            onCheckedChange={(checked) => {
                              const next =
                                checked === true
                                  ? [...field.value, persona]
                                  : field.value.filter((v) => v !== persona);
                              field.onChange(next);
                            }}
                          />
                          {persona}
                        </label>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="scope"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scope</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="INDIVIDUAL">INDIVIDUAL</SelectItem>
                          <SelectItem value="TEAM">TEAM</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="target_metric_key"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Metric Key</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g. leads_verified"
                          disabled={isSubmitting}
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
                  name="target_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Value</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          {...field}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reward_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reward Type</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="XP">XP</SelectItem>
                          <SelectItem value="PAISE">PAISE</SelectItem>
                          <SelectItem value="PERK">PERK</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="reward_value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reward Value</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Start date"
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value}
                          onChange={field.onChange}
                          minDate={form.watch("start_date") || undefined}
                          placeholder="End date"
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Quest"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
