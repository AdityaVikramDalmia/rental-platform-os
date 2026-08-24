"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

const checkInFormSchema = z.object({
  notes: z.string().trim().min(10, "Notes must be at least 10 characters"),
  action_items: z.array(
    z.object({
      description: z.string().trim().min(1, "Action item description is required"),
      due_date: z.string().optional(),
    }),
  ),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEEDS_IMPROVEMENT"]).optional(),
  next_review_date: z.string().optional(),
});

type CheckInFormValues = z.infer<typeof checkInFormSchema>;

type CheckInFormProps = {
  agentId: Id<"users">;
  agentName: string;
  action: (type: "success" | "cancel") => void;
};

function toDateInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  const parsedDate = new Date(year, month - 1, day);
  parsedDate.setHours(0, 0, 0, 0);
  return parsedDate.getTime();
}

export function CheckInForm({ agentId, agentName, action }: CheckInFormProps) {
  const createCheckIn = useMutation(api.opsManagement.createCheckIn);
  const [todayMs] = useState(() => Date.now());

  const form = useForm<CheckInFormValues>({
    resolver: zodResolver(checkInFormSchema),
    defaultValues: {
      notes: "",
      action_items: [],
      sentiment: undefined,
      next_review_date: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "action_items",
  });

  async function onSubmit(values: CheckInFormValues) {
    try {
      await createCheckIn({
        agent_user_id: agentId,
        notes: values.notes.trim(),
        action_items: values.action_items.map((item) => ({
          description: item.description.trim(),
          due_date: fromDateInputValue(item.due_date),
          completed: false as const,
        })),
        sentiment: values.sentiment,
        next_review_date: fromDateInputValue(values.next_review_date),
      });

      toast.success("Check-in recorded successfully");
      form.reset({
        notes: "",
        action_items: [],
        sentiment: undefined,
        next_review_date: "",
      });
      action("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save check-in";
      toast.error(message);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-slate-900">New Check-In</h4>
        <p className="text-xs text-slate-600">Log coaching notes for {agentName}.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={4}
                    placeholder="Key discussion points, blockers, and coaching notes"
                    className="border-slate-300 bg-white"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">Action Items</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ description: "", due_date: "" })}
                disabled={form.formState.isSubmitting}
              >
                <Plus className="size-4" />
                Add Action Item
              </Button>
            </div>

            {fields.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
                No action items added yet.
              </p>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="space-y-2 rounded-md border border-slate-200 bg-white p-3"
                  >
                    <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
                      <FormField
                        control={form.control}
                        name={`action_items.${index}.description`}
                        render={({ field: descriptionField }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Input
                                {...descriptionField}
                                placeholder="Follow up with tenant by Tuesday"
                                className="border-slate-300"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`action_items.${index}.due_date`}
                        render={({ field: dueDateField }) => (
                          <FormItem>
                            <FormLabel>Due Date (Optional)</FormLabel>
                            <FormControl>
                              <DatePicker
                                value={dueDateField.value}
                                minDate={toDateInputValue(todayMs)}
                                onChange={dueDateField.onChange}
                                placeholder="Select due date"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => remove(index)}
                        disabled={form.formState.isSubmitting}
                        aria-label="Remove action item"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <FormField
            control={form.control}
            name="sentiment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sentiment (Optional)</FormLabel>
                <FormControl>
                  <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2">
                    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-700">
                      <RadioGroupItem id="checkin-sentiment-positive" value="POSITIVE" />
                      <Label htmlFor="checkin-sentiment-positive" className="cursor-pointer">
                        Positive
                      </Label>
                    </div>
                    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-700">
                      <RadioGroupItem id="checkin-sentiment-neutral" value="NEUTRAL" />
                      <Label htmlFor="checkin-sentiment-neutral" className="cursor-pointer">
                        Neutral
                      </Label>
                    </div>
                    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-700">
                      <RadioGroupItem
                        id="checkin-sentiment-needs-improvement"
                        value="NEEDS_IMPROVEMENT"
                      />
                      <Label
                        htmlFor="checkin-sentiment-needs-improvement"
                        className="cursor-pointer"
                      >
                        Needs Improvement
                      </Label>
                    </div>
                  </RadioGroup>
                </FormControl>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => form.setValue("sentiment", undefined)}
                  >
                    Clear
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="next_review_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Next Review Date (Optional)</FormLabel>
                <FormControl>
                  <DatePicker
                    value={field.value}
                    minDate={toDateInputValue(todayMs)}
                    onChange={field.onChange}
                    placeholder="Select next review date"
                  />
                </FormControl>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => form.setValue("next_review_date", "")}
                  >
                    Clear
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => action("cancel")}
              disabled={form.formState.isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Check-In"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
