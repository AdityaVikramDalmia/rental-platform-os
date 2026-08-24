"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "convex/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
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

const onboardSchema = z.object({
  owner_email: z.string().trim().email("Please provide a valid email address"),
});

type OnboardFormValues = z.infer<typeof onboardSchema>;

type OnboardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: Id<"owner_service_requests">;
  ownerName: string;
  ownerEmail: string | undefined;
};

export function OnboardDialog({
  open,
  onOpenChange,
  requestId,
  ownerName,
  ownerEmail,
}: OnboardDialogProps) {
  const createOwnerAccount = useAction(api.actions.workos.createOwnerAccount);
  const form = useForm<OnboardFormValues>({
    resolver: zodResolver(onboardSchema),
    defaultValues: {
      owner_email: ownerEmail ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({ owner_email: ownerEmail ?? "" });
    }
  }, [form, open, ownerEmail]);

  const onSubmit = async (values: OnboardFormValues) => {
    const normalizedEmail = values.owner_email.trim().toLowerCase();

    try {
      const result = await createOwnerAccount({
        owner_request_id: requestId,
        owner_email: normalizedEmail,
        name: ownerName,
      });

      if (result.isNewOwner) {
        toast.success("Owner account created successfully. They can now sign in with Google.");
      } else {
        toast.success(
          "Existing owner account linked successfully. They can sign in with their existing Google credentials.",
        );
      }
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create owner account";
      if (message.toLowerCase().includes("different user type")) {
        toast.error("This email is already linked to a different user type.");
        return;
      }

      toast.error(message);
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Onboard Owner</DialogTitle>
          <DialogDescription>
            Create a WorkOS account for {ownerName}. They will be able to sign in with Google using
            this email address.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className="space-y-3 py-2">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <span className="font-medium text-slate-900">Owner:</span> {ownerName}
              </div>

              <FormField
                control={form.control}
                name="owner_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Owner Email <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="owner@example.com" {...field} />
                    </FormControl>
                    <p className="text-xs text-slate-500">
                      The owner will use this email to sign in with Google.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                {isSubmitting ? "Creating Account..." : "Create Owner Account"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
