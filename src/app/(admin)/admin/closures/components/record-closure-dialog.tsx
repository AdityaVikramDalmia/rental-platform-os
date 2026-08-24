"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { LEAD_STATUS } from "../../../../../../lib/constants";
import { rupeesToPaise } from "../../../../../../lib/money";
import { isValidConvexId } from "../../../../../../lib/validators";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentUploader } from "./document-uploader";

const recordClosureSchema = z.object({
  lead_id: z.string().min(1, "Select a verified lead"),
  visit_id: z.string().optional(),
  negotiation_id: z.string().optional(),
  deal_checklist_id: z.string().optional(),
  demorentals_deal_id: z.string().optional(),
  move_in_date: z.string().min(1, "Move-in date is required"),
  commission_amount: z
    .string()
    .optional()
    .refine(
      (val) => !val || (!Number.isNaN(Number(val)) && Number(val) >= 0),
      "Must be a non-negative number",
    ),
  brokerage_tenant_side: z
    .string()
    .optional()
    .refine(
      (val) => !val || (!Number.isNaN(Number(val)) && Number(val) >= 0),
      "Must be a non-negative number",
    ),
  brokerage_owner_side: z
    .string()
    .optional()
    .refine(
      (val) => !val || (!Number.isNaN(Number(val)) && Number(val) >= 0),
      "Must be a non-negative number",
    ),
  notes: z.string().optional(),
});

type RecordClosureFormValues = z.infer<typeof recordClosureSchema>;

type RecordClosureDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const NO_LINK_VALUE = "__none__";

function parseIdParam(value: string | null): string | undefined {
  if (!value || !isValidConvexId(value)) {
    return undefined;
  }

  return value;
}

function formatVisitLabel(visit: {
  _id: Id<"visits">;
  status: string;
  scheduled_start: number;
  tenant_inquiry_id?: Id<"tenant_inquiries">;
}): string {
  const schedule = new Date(visit.scheduled_start).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

  return `#${visit._id.slice(-6)} · ${visit.status} · ${schedule}${visit.tenant_inquiry_id ? "" : " · no inquiry"}`;
}

export function RecordClosureDialog({ open, onOpenChange }: RecordClosureDialogProps) {
  const searchParams = useSearchParams();
  const createClosure = useMutation(api.closures.create);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasInitializedPrefill, setHasInitializedPrefill] = useState(false);
  const [rentAgreement, setRentAgreement] = useState<Id<"_storage"> | null>(null);
  const [additionalDocs, setAdditionalDocs] = useState<
    Array<{ name: string; storage_id: Id<"_storage"> }>
  >([]);

  const prefillLeadId = parseIdParam(searchParams.get("lead_id")) as Id<"leads"> | undefined;
  const prefillVisitId = parseIdParam(searchParams.get("visit_id")) as Id<"visits"> | undefined;
  const prefillNegotiationId = parseIdParam(searchParams.get("negotiation_id")) as
    | Id<"negotiations">
    | undefined;
  const prefillChecklistId = parseIdParam(searchParams.get("deal_checklist_id")) as
    | Id<"deal_checklists">
    | undefined;

  const verifiedLeads = useQuery(
    api.leads.list,
    open
      ? {
          paginationOpts: { numItems: 200, cursor: null },
          status: LEAD_STATUS.VERIFIED,
        }
      : "skip",
  );

  const form = useForm<RecordClosureFormValues>({
    resolver: zodResolver(recordClosureSchema),
    defaultValues: {
      lead_id: "",
      visit_id: "",
      negotiation_id: "",
      deal_checklist_id: "",
      demorentals_deal_id: "",
      move_in_date: "",
      commission_amount: "",
      brokerage_tenant_side: "",
      brokerage_owner_side: "",
      notes: "",
    },
  });

  const watchedLeadId = form.watch("lead_id");
  const watchedVisitId = form.watch("visit_id");
  const watchedNegotiationId = form.watch("negotiation_id");

  const linkOptions = useQuery(
    api.closures.getCreateFormLinkOptions,
    open
      ? {
          lead_id: watchedLeadId ? (watchedLeadId as Id<"leads">) : prefillLeadId,
          negotiation_id: watchedNegotiationId
            ? (watchedNegotiationId as Id<"negotiations">)
            : prefillNegotiationId,
        }
      : "skip",
  );

  const existingClosure = useQuery(
    api.closures.getByLeadId,
    watchedLeadId ? { lead_id: watchedLeadId as Id<"leads"> } : "skip",
  );

  const hasExistingClosure = existingClosure !== undefined && existingClosure !== null;

  const visitOptions = linkOptions?.visits ?? [];
  const negotiationOptions = linkOptions?.negotiations ?? [];

  const selectedVisit = useMemo(() => {
    if (!watchedVisitId) {
      return null;
    }
    return visitOptions.find((visit) => visit._id === watchedVisitId) ?? null;
  }, [visitOptions, watchedVisitId]);

  const selectedNegotiation = useMemo(() => {
    if (!watchedNegotiationId) {
      return null;
    }
    return (
      negotiationOptions.find((negotiation) => negotiation._id === watchedNegotiationId) ?? null
    );
  }, [negotiationOptions, watchedNegotiationId]);

  const selectedInquiryId =
    selectedVisit?.tenant_inquiry_id ?? selectedNegotiation?.tenant_inquiry_id ?? undefined;

  const checklistOptions = useMemo(() => {
    const allChecklists = linkOptions?.approved_checklists ?? [];
    if (!selectedInquiryId) {
      return allChecklists;
    }

    return allChecklists.filter(
      (checklist) => checklist.inquiry_id.toString() === selectedInquiryId.toString(),
    );
  }, [linkOptions, selectedInquiryId]);

  const selectedLead = useMemo(() => {
    if (!verifiedLeads?.page || !watchedLeadId) return null;
    return verifiedLeads.page.find((l) => l._id === watchedLeadId) ?? null;
  }, [verifiedLeads, watchedLeadId]);

  useEffect(() => {
    if (!open) {
      form.reset();
      setRentAgreement(null);
      setAdditionalDocs([]);
      setHasInitializedPrefill(false);
    }
  }, [open, form]);

  useEffect(() => {
    if (!open || hasInitializedPrefill || linkOptions === undefined) {
      return;
    }

    const resolvedLeadId = prefillLeadId ?? linkOptions.lead_id;

    if (resolvedLeadId) {
      form.setValue("lead_id", resolvedLeadId);
    }

    if (prefillNegotiationId) {
      form.setValue("negotiation_id", prefillNegotiationId);
    }

    if (prefillVisitId) {
      form.setValue("visit_id", prefillVisitId);
    }

    if (prefillChecklistId) {
      form.setValue("deal_checklist_id", prefillChecklistId);
    }

    setHasInitializedPrefill(true);
  }, [
    open,
    hasInitializedPrefill,
    linkOptions,
    prefillLeadId,
    prefillNegotiationId,
    prefillVisitId,
    prefillChecklistId,
    form,
  ]);

  useEffect(() => {
    if (!open || linkOptions === undefined) {
      return;
    }

    const currentNegotiationId = form.getValues("negotiation_id");
    if (
      currentNegotiationId &&
      !negotiationOptions.some((item) => item._id === currentNegotiationId)
    ) {
      form.setValue("negotiation_id", "");
    }

    const currentVisitId = form.getValues("visit_id");
    if (currentVisitId && !visitOptions.some((item) => item._id === currentVisitId)) {
      form.setValue("visit_id", "");
    }

    const currentChecklistId = form.getValues("deal_checklist_id");
    if (currentChecklistId && !checklistOptions.some((item) => item._id === currentChecklistId)) {
      form.setValue("deal_checklist_id", "");
    }
  }, [form, checklistOptions, linkOptions, negotiationOptions, open, visitOptions]);

  const onSubmit = useCallback(
    async (values: RecordClosureFormValues) => {
      if (hasExistingClosure) return;
      setIsSubmitting(true);
      try {
        const moveInMs = new Date(`${values.move_in_date}T00:00:00+05:30`).getTime();

        const payload: {
          lead_id: Id<"leads">;
          visit_id?: Id<"visits">;
          negotiation_id?: Id<"negotiations">;
          deal_checklist_id?: Id<"deal_checklists">;
          move_in_date: number;
          demorentals_deal_id?: string;
          commission_amount?: number;
          brokerage_tenant_side?: number;
          brokerage_owner_side?: number;
          rent_agreement_storage_id?: Id<"_storage">;
          additional_documents?: Array<{ name: string; storage_id: Id<"_storage"> }>;
          notes?: string;
        } = {
          lead_id: values.lead_id as Id<"leads">,
          move_in_date: moveInMs,
        };

        if (values.visit_id?.trim()) {
          payload.visit_id = values.visit_id as Id<"visits">;
        }
        if (values.negotiation_id?.trim()) {
          payload.negotiation_id = values.negotiation_id as Id<"negotiations">;
        }
        if (values.deal_checklist_id?.trim()) {
          payload.deal_checklist_id = values.deal_checklist_id as Id<"deal_checklists">;
        }
        if (values.demorentals_deal_id?.trim()) {
          payload.demorentals_deal_id = values.demorentals_deal_id.trim();
        }
        if (values.commission_amount !== undefined && values.commission_amount !== "") {
          payload.commission_amount = rupeesToPaise(Number(values.commission_amount));
        }
        if (values.brokerage_tenant_side !== undefined && values.brokerage_tenant_side !== "") {
          payload.brokerage_tenant_side = rupeesToPaise(Number(values.brokerage_tenant_side));
        }
        if (values.brokerage_owner_side !== undefined && values.brokerage_owner_side !== "") {
          payload.brokerage_owner_side = rupeesToPaise(Number(values.brokerage_owner_side));
        }
        if (rentAgreement) {
          payload.rent_agreement_storage_id = rentAgreement;
        }
        if (additionalDocs.length > 0) {
          payload.additional_documents = additionalDocs;
        }
        if (values.notes?.trim()) {
          payload.notes = values.notes.trim();
        }

        await createClosure(payload);
        toast.success("Closure recorded!");
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create closure");
      } finally {
        setIsSubmitting(false);
      }
    },
    [hasExistingClosure, createClosure, onOpenChange, rentAgreement, additionalDocs],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Closure</DialogTitle>
          <DialogDescription>
            Record a deal closure for a verified lead with financial details and documents.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="lead_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead *</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a verified lead..." />
                      </SelectTrigger>
                      <SelectContent>
                        {verifiedLeads?.page.map((lead) => (
                          <SelectItem key={lead._id} value={lead._id}>
                            {lead.building_name ?? "—"} / {lead.flat_number} —{" "}
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

            {selectedLead && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <span className="font-medium text-slate-800">{selectedLead.society_name}</span>
                {" — "}
                {selectedLead.building_name} / {selectedLead.flat_number}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <FormField
                control={form.control}
                name="negotiation_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Negotiation</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value || NO_LINK_VALUE}
                        onValueChange={(value) =>
                          field.onChange(value === NO_LINK_VALUE ? "" : value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Link a negotiation" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_LINK_VALUE}>Not linked</SelectItem>
                          {negotiationOptions.map((negotiation) => (
                            <SelectItem key={negotiation._id} value={negotiation._id}>
                              #{negotiation._id.slice(-6)} - {negotiation.status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="visit_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visit</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value || NO_LINK_VALUE}
                        onValueChange={(value) =>
                          field.onChange(value === NO_LINK_VALUE ? "" : value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Link a visit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_LINK_VALUE}>Not linked</SelectItem>
                          {visitOptions.map((visit) => (
                            <SelectItem key={visit._id} value={visit._id}>
                              {formatVisitLabel(visit)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="deal_checklist_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deal Checklist</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value || NO_LINK_VALUE}
                      onValueChange={(value) =>
                        field.onChange(value === NO_LINK_VALUE ? "" : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Link approved checklist" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_LINK_VALUE}>Not linked</SelectItem>
                        {checklistOptions.map((checklist) => (
                          <SelectItem key={checklist._id} value={checklist._id}>
                            #{checklist._id.slice(-6)} - v{checklist.version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {hasExistingClosure && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">
                  A closure already exists for this lead.
                </p>
                <Link
                  href={`/admin/closures/${existingClosure._id}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  View Closure
                </Link>
              </div>
            )}

            <FormField
              control={form.control}
              name="demorentals_deal_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>DemoRentals Deal ID</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., FD-2026-001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="move_in_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Move-In Date *</FormLabel>
                  <FormControl>
                    <DatePicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="commission_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commission (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="1" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="brokerage_tenant_side"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brokerage Tenant (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="1" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="brokerage_owner_side"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brokerage Owner (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="1" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DocumentUploader
              mode="single"
              label="Rent Agreement"
              value={rentAgreement}
              onChange={setRentAgreement}
            />

            <DocumentUploader
              mode="multi"
              label="Additional Documents"
              value={additionalDocs}
              onChange={setAdditionalDocs}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Context, special terms, remarks..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
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
                disabled={isSubmitting || hasExistingClosure}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Recording...
                  </>
                ) : (
                  "Record Closure"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
