"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Mail, MessageCircleMore, Phone, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  SUPPORT_INQUIRY_STATUS,
  SUPPORT_INQUIRY_STATUS_COLORS,
  SUPPORT_INQUIRY_STATUS_LABELS,
  type SupportInquiryStatus,
} from "../../../../../../lib/constants";
import { formatDateTime } from "../../../../../../lib/dates";
import { formatPhoneDisplay } from "../../../../../../lib/validators";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const assignSchema = z.object({
  assigned_admin_id: z.string().min(1, "Please select an admin"),
});

const notesSchema = z.object({
  ops_notes: z.string().max(2000, "Ops notes are too long").optional(),
});

type AssignValues = z.infer<typeof assignSchema>;
type NotesValues = z.infer<typeof notesSchema>;

type StatusActionTarget = Exclude<SupportInquiryStatus, "OPEN">;

const STATUS_ACTIONS: Record<
  SupportInquiryStatus,
  Array<{
    label: string;
    target: StatusActionTarget;
    variant: "default" | "outline" | "destructive";
  }>
> = {
  [SUPPORT_INQUIRY_STATUS.OPEN]: [
    { label: "Start Progress", target: SUPPORT_INQUIRY_STATUS.IN_PROGRESS, variant: "default" },
    { label: "Resolve", target: SUPPORT_INQUIRY_STATUS.RESOLVED, variant: "outline" },
    { label: "Close", target: SUPPORT_INQUIRY_STATUS.CLOSED, variant: "destructive" },
  ],
  [SUPPORT_INQUIRY_STATUS.IN_PROGRESS]: [
    { label: "Resolve", target: SUPPORT_INQUIRY_STATUS.RESOLVED, variant: "outline" },
    { label: "Close", target: SUPPORT_INQUIRY_STATUS.CLOSED, variant: "destructive" },
  ],
  [SUPPORT_INQUIRY_STATUS.RESOLVED]: [
    { label: "Close", target: SUPPORT_INQUIRY_STATUS.CLOSED, variant: "destructive" },
  ],
  [SUPPORT_INQUIRY_STATUS.CLOSED]: [],
};

type InquiryDetailPanelProps = {
  inquiryId: Id<"support_inquiries"> | null;
  onClose: () => void;
  canManage: boolean;
  currentAdminId: Id<"users"> | null;
};

export function InquiryDetailPanel({
  inquiryId,
  onClose,
  canManage,
  currentAdminId,
}: InquiryDetailPanelProps) {
  const inquiry = useQuery(api.supportInquiries.getById, inquiryId ? { id: inquiryId } : "skip");
  const admins = useQuery(api.admins.listAdmins, inquiryId && canManage ? {} : "skip");

  const updateStatus = useMutation(api.supportInquiries.updateStatus);
  const assignInquiry = useMutation(api.supportInquiries.assign);
  const updateOpsNotes = useMutation(api.supportInquiries.updateOpsNotes);

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<StatusActionTarget | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [assigningToMe, setAssigningToMe] = useState(false);

  const assignForm = useForm<AssignValues>({
    resolver: zodResolver(assignSchema),
    defaultValues: { assigned_admin_id: "" },
  });

  const notesForm = useForm<NotesValues>({
    resolver: zodResolver(notesSchema),
    defaultValues: { ops_notes: "" },
  });

  useEffect(() => {
    if (!inquiry) {
      return;
    }

    assignForm.reset({ assigned_admin_id: inquiry.assigned_admin_id ?? "" });
    notesForm.reset({ ops_notes: inquiry.ops_notes ?? "" });
  }, [assignForm, inquiry, notesForm]);

  const isOpen = inquiryId !== null;
  const isLoading = isOpen && inquiry === undefined;

  const availableActions = useMemo(() => {
    if (!inquiry || !canManage) {
      return [];
    }

    return STATUS_ACTIONS[inquiry.status];
  }, [canManage, inquiry]);

  async function onAssign(values: AssignValues) {
    if (!inquiry || !admins) {
      return;
    }

    const selectedAdmin = admins.find((admin) => admin._id === values.assigned_admin_id);
    if (!selectedAdmin) {
      toast.error("Selected admin not found");
      return;
    }

    try {
      await assignInquiry({
        id: inquiry._id,
        assigned_admin_id: selectedAdmin._id,
      });
      toast.success("Inquiry assignment updated");
      setAssignDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign inquiry");
    }
  }

  async function handleAssignToMe() {
    if (!inquiry || !currentAdminId) {
      return;
    }

    setAssigningToMe(true);
    try {
      await assignInquiry({
        id: inquiry._id,
        assigned_admin_id: currentAdminId,
      });
      toast.success("Assigned to you");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign inquiry");
    } finally {
      setAssigningToMe(false);
    }
  }

  async function handleStatusUpdate() {
    if (!inquiry || !statusTarget) {
      return;
    }

    setStatusUpdating(true);
    try {
      await updateStatus({
        id: inquiry._id,
        status: statusTarget,
      });
      toast.success(`Inquiry moved to ${SUPPORT_INQUIRY_STATUS_LABELS[statusTarget]}`);
      setStatusTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update inquiry status");
    } finally {
      setStatusUpdating(false);
    }
  }

  async function onSaveNotes(values: NotesValues) {
    if (!inquiry) {
      return;
    }

    try {
      await updateOpsNotes({
        id: inquiry._id,
        ops_notes: values.ops_notes?.trim() || undefined,
      });
      toast.success("Ops notes saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save ops notes");
    }
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            {isLoading ? (
              <>
                <SheetTitle className="sr-only">Loading inquiry details</SheetTitle>
                <SheetDescription className="sr-only">Please wait</SheetDescription>
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-4 w-40" />
              </>
            ) : inquiry ? (
              <>
                <div className="flex items-center gap-2">
                  <SheetTitle>Support Inquiry #{inquiry._id.slice(-6)}</SheetTitle>
                  <Badge className={cn("text-xs", SUPPORT_INQUIRY_STATUS_COLORS[inquiry.status])}>
                    {SUPPORT_INQUIRY_STATUS_LABELS[inquiry.status]}
                  </Badge>
                </div>
                <SheetDescription>{formatDateTime(inquiry._creationTime)}</SheetDescription>
              </>
            ) : (
              <>
                <SheetTitle>Support Inquiry</SheetTitle>
                <SheetDescription>Select an inquiry to view details.</SheetDescription>
              </>
            )}
          </SheetHeader>

          {isLoading ? (
            <div className="space-y-4 px-4 py-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}

          {inquiry ? (
            <div className="space-y-5 px-4 pb-6">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Submitter Details
                </h3>
                <div className="space-y-1 text-sm">
                  <p className="inline-flex items-center gap-2 text-slate-900">
                    <User className="size-3.5 text-slate-500" />
                    <span className="font-medium">{inquiry.name}</span>
                  </p>
                  <p className="inline-flex items-center gap-2 text-slate-700">
                    <Mail className="size-3.5 text-slate-500" />
                    {inquiry.email}
                  </p>
                  <p className="inline-flex items-center gap-2 text-slate-700">
                    <Phone className="size-3.5 text-slate-500" />
                    {inquiry.phone ? formatPhoneDisplay(inquiry.phone) : "Phone not provided"}
                  </p>
                </div>
              </section>

              <Separator />

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Inquiry
                </h3>
                <p className="text-sm font-medium text-slate-900">{inquiry.subject}</p>
                <p className="text-sm text-slate-700">{inquiry.message}</p>
                <div className="grid grid-cols-1 gap-y-1 pt-1 text-sm sm:grid-cols-2">
                  <p className="text-slate-600">
                    Persona:{" "}
                    <span className="font-medium text-slate-900">
                      {inquiry.persona_type ?? "Not specified"}
                    </span>
                  </p>
                  <p className="text-slate-600">
                    Contact Method:{" "}
                    <span className="font-medium text-slate-900">
                      {inquiry.preferred_contact_method ?? "Not specified"}
                    </span>
                  </p>
                  <p className="text-slate-600">
                    Source Channel:{" "}
                    <span className="font-medium text-slate-900">
                      {inquiry.source_channel ?? "Not specified"}
                    </span>
                  </p>
                  <p className="text-slate-600">
                    Resolved At:{" "}
                    <span className="font-medium text-slate-900">
                      {inquiry.resolved_at ? formatDateTime(inquiry.resolved_at) : "-"}
                    </span>
                  </p>
                  <p className="text-slate-600">
                    Closed At:{" "}
                    <span className="font-medium text-slate-900">
                      {inquiry.closed_at ? formatDateTime(inquiry.closed_at) : "-"}
                    </span>
                  </p>
                </div>
              </section>

              <Separator />

              <section className="space-y-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Assignment
                  </h3>
                  <p className="mt-1 text-sm text-slate-700">
                    Assigned to:{" "}
                    <span className="font-medium">
                      {inquiry.assigned_admin_name ?? "Unassigned"}
                    </span>
                  </p>
                </div>

                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAssignDialogOpen(true)}
                    >
                      Assign
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAssignToMe}
                      disabled={assigningToMe || currentAdminId === null}
                    >
                      {assigningToMe ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Assigning...
                        </>
                      ) : (
                        "Assign to Me"
                      )}
                    </Button>
                  </div>
                ) : null}
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Status Actions
                </h3>

                {canManage ? (
                  availableActions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {availableActions.map((action) => (
                        <Button
                          key={action.target}
                          type="button"
                          variant={action.variant}
                          size="sm"
                          onClick={() => setStatusTarget(action.target)}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      No actions available for closed inquiries.
                    </p>
                  )
                ) : (
                  <p className="text-sm text-slate-500">
                    You do not have permission to update support inquiry status.
                  </p>
                )}
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Ops Notes
                </h3>

                {canManage ? (
                  <Form {...notesForm}>
                    <form
                      onSubmit={notesForm.handleSubmit(onSaveNotes)}
                      className="space-y-3"
                      noValidate
                    >
                      <FormField
                        control={notesForm.control}
                        name="ops_notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Textarea
                                {...field}
                                value={field.value ?? ""}
                                rows={5}
                                placeholder="Add internal notes for ops handoff"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button type="submit" size="sm" disabled={notesForm.formState.isSubmitting}>
                        {notesForm.formState.isSubmitting ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save Notes"
                        )}
                      </Button>
                    </form>
                  </Form>
                ) : (
                  <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    {inquiry.ops_notes ?? "No internal notes added."}
                  </p>
                )}
              </section>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Support Inquiry</DialogTitle>
            <DialogDescription>Select an admin to handle this inquiry.</DialogDescription>
          </DialogHeader>

          <Form {...assignForm}>
            <form onSubmit={assignForm.handleSubmit(onAssign)} className="space-y-4" noValidate>
              <FormField
                control={assignForm.control}
                name="assigned_admin_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assign To</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select admin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(admins ?? []).map((admin) => (
                          <SelectItem key={admin._id} value={admin._id}>
                            {admin.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={assignForm.formState.isSubmitting}>
                  {assignForm.formState.isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    "Assign"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={statusTarget !== null} onOpenChange={(open) => !open && setStatusTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Status Update</DialogTitle>
            <DialogDescription>
              Move this inquiry to {statusTarget ? SUPPORT_INQUIRY_STATUS_LABELS[statusTarget] : ""}
              ?
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p className="inline-flex items-center gap-2">
              <MessageCircleMore className="size-4" />
              Status transitions are forward-only and cannot be reversed.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStatusTarget(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleStatusUpdate} disabled={statusUpdating}>
              {statusUpdating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
