"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Doc } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { sanitizeConvexError } from "@/lib/error-utils";
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
import { SOCIETY_STATUS } from "../../../lib/constants";

const societyFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  city: z.string().trim().min(1, "City is required"),
  address: z.string().optional(),
  notes: z.string().optional(),
  status: z
    .enum([SOCIETY_STATUS.ONBOARDING, SOCIETY_STATUS.ACTIVE, SOCIETY_STATUS.INACTIVE])
    .optional(),
});

type SocietyFormValues = z.infer<typeof societyFormSchema>;

type SocietyCreateDialogProps = {
  open: boolean;
  action: (open: boolean) => void;
  society?: Doc<"societies">;
};

function normalizeOptionalInput(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

export function SocietyCreateDialog({ open, action, society }: SocietyCreateDialogProps) {
  const createSociety = useMutation(api.societies.create);
  const updateSociety = useMutation(api.societies.update);
  const [isInactiveConfirmationOpen, setIsInactiveConfirmationOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<SocietyFormValues | null>(null);
  const isEditMode = society !== undefined;

  const form = useForm<SocietyFormValues>({
    resolver: zodResolver(societyFormSchema),
    defaultValues: {
      name: "",
      city: "",
      address: "",
      notes: "",
      status: SOCIETY_STATUS.ONBOARDING,
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset({
      name: society?.name ?? "",
      city: society?.city ?? "",
      address: society?.address ?? "",
      notes: society?.notes ?? "",
      status: society?.status ?? SOCIETY_STATUS.ONBOARDING,
    });
  }, [form, open, society]);

  async function submitSociety(values: SocietyFormValues) {
    const name = values.name.trim();
    const city = values.city.trim();
    const address = normalizeOptionalInput(values.address);
    const notes = normalizeOptionalInput(values.notes);

    try {
      if (isEditMode && society) {
        await updateSociety({
          id: society._id,
          name,
          city,
          address,
          notes,
          status: values.status,
        });

        toast.success("Society updated");
      } else {
        await createSociety({
          name,
          city,
          address,
          notes,
        });

        toast.success("Society created");
      }

      action(false);
      form.reset();
    } catch (error) {
      const message = sanitizeConvexError(error);
      toast.error(message);
    }
  }

  async function onSubmit(values: SocietyFormValues) {
    if (
      isEditMode &&
      society &&
      values.status === SOCIETY_STATUS.INACTIVE &&
      society.status !== SOCIETY_STATUS.INACTIVE
    ) {
      setPendingValues(values);
      setIsInactiveConfirmationOpen(true);
      return;
    }

    await submitSociety(values);
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          action(nextOpen);

          if (!nextOpen) {
            setIsInactiveConfirmationOpen(false);
            setPendingValues(null);
            form.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit Society" : "Add Society"}</DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update society details and lifecycle status."
                : "Create a new society for onboarding."}
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
                        placeholder="Society name"
                        className="h-10 border-slate-300"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="City" className="h-10 border-slate-300" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address (optional)</FormLabel>
                    <FormControl>
                      <textarea
                        {...field}
                        rows={3}
                        placeholder="Street, locality, landmarks"
                        className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      />
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
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <textarea
                        {...field}
                        rows={3}
                        placeholder="Anything important for operations"
                        className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isEditMode ? (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <FormControl>
                        <select
                          value={field.value}
                          onChange={(event) => field.onChange(event.target.value)}
                          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                        >
                          <option value={SOCIETY_STATUS.ONBOARDING}>ONBOARDING</option>
                          <option value={SOCIETY_STATUS.ACTIVE}>ACTIVE</option>
                          <option value={SOCIETY_STATUS.INACTIVE}>INACTIVE</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => action(false)}>
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
                      Saving...
                    </>
                  ) : isEditMode ? (
                    "Update Society"
                  ) : (
                    "Create Society"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isInactiveConfirmationOpen} onOpenChange={setIsInactiveConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set society to INACTIVE?</DialogTitle>
            <DialogDescription>
              Guards in this society will be unable to submit new leads. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsInactiveConfirmationOpen(false);
                setPendingValues(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isSubmitting}
              onClick={async () => {
                if (!pendingValues) {
                  setIsInactiveConfirmationOpen(false);
                  return;
                }

                setIsInactiveConfirmationOpen(false);
                await submitSociety(pendingValues);
                setPendingValues(null);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
