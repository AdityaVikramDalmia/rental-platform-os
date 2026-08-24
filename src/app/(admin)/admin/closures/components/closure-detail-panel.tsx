"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import {
  Building2,
  ClipboardList,
  ExternalLink,
  FileText,
  Flag,
  Home,
  Loader2,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { api } from "../../../../../../convex/_generated/api";
import {
  CLOSURE_STATUS,
  PAYOUT_STATUS,
  type ClosureStatus,
  type PayoutStatus,
} from "../../../../../../lib/constants";
import { formatINR, paiseToRupees, rupeesToPaise } from "../../../../../../lib/money";
import { ClosureStatusBadge } from "@/components/shared/closure-status-badge";
import { PayoutStatusBadge } from "@/components/shared/payout-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CreatePayoutDialog } from "../../payouts/components/create-payout-dialog";
import { DocumentUploader } from "./document-uploader";

const IST_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const IST_DATETIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

function msToDateInput(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).formatToParts(new Date(ms));
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

const editClosureSchema = z.object({
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

type EditClosureFormValues = z.infer<typeof editClosureSchema>;

type ClosureData = {
  closure: {
    _id: Id<"closures">;
    _creationTime: number;
    lead_id: Id<"leads">;
    listing_id?: Id<"listings"> | null;
    demorentals_deal_id?: string;
    move_in_date: number;
    status: string;
    rent_agreement_storage_id?: Id<"_storage">;
    commission_amount?: number;
    brokerage_tenant_side?: number;
    brokerage_owner_side?: number;
    notes?: string;
    additional_documents?: Array<{ name: string; storage_id: Id<"_storage"> }>;
    confirmed_at?: number;
    closed_by_admin_id: Id<"users">;
  };
  lead: {
    _id: Id<"leads">;
    flat_number: string;
    floor_number: string;
  } | null;
  building: { _id: Id<"buildings">; name: string } | null;
  society: { _id: Id<"societies">; name: string; city: string } | null;
  guard: {
    user_id: Id<"users">;
    name: string;
    phone?: string;
    status: string;
  } | null;
  listing: { _id: Id<"listings">; slug?: string } | null;
  payout: { _id: Id<"payouts">; status: PayoutStatus; amount_paise?: number } | null;
  rent_agreement_url: string | null;
  additional_document_urls: Array<{
    name: string;
    storage_id: Id<"_storage">;
    url: string | null;
  }>;
};

type ClosureDetailPanelProps = {
  data: ClosureData;
  canEdit?: boolean;
  canCreatePayout?: boolean;
};

export function ClosureDetailPanel({
  data,
  canEdit = false,
  canCreatePayout = false,
}: ClosureDetailPanelProps) {
  const updateClosure = useMutation(api.closures.update);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatePayoutOpen, setIsCreatePayoutOpen] = useState(false);
  const [editRentAgreement, setEditRentAgreement] = useState<Id<"_storage"> | null>(
    data.closure.rent_agreement_storage_id ?? null,
  );
  const [editAdditionalDocs, setEditAdditionalDocs] = useState<
    Array<{ name: string; storage_id: Id<"_storage"> }>
  >(data.closure.additional_documents ?? []);

  const isTerminal =
    data.closure.status === CLOSURE_STATUS.CONFIRMED ||
    data.closure.status === CLOSURE_STATUS.CANCELLED;

  const form = useForm<EditClosureFormValues>({
    resolver: zodResolver(editClosureSchema),
    defaultValues: {
      demorentals_deal_id: data.closure.demorentals_deal_id ?? "",
      move_in_date: msToDateInput(data.closure.move_in_date),
      commission_amount:
        data.closure.commission_amount !== undefined
          ? String(paiseToRupees(data.closure.commission_amount))
          : "",
      brokerage_tenant_side:
        data.closure.brokerage_tenant_side !== undefined
          ? String(paiseToRupees(data.closure.brokerage_tenant_side))
          : "",
      brokerage_owner_side:
        data.closure.brokerage_owner_side !== undefined
          ? String(paiseToRupees(data.closure.brokerage_owner_side))
          : "",
      notes: data.closure.notes ?? "",
    },
  });

  useEffect(() => {
    form.reset({
      demorentals_deal_id: data.closure.demorentals_deal_id ?? "",
      move_in_date: msToDateInput(data.closure.move_in_date),
      commission_amount:
        data.closure.commission_amount !== undefined
          ? String(paiseToRupees(data.closure.commission_amount))
          : "",
      brokerage_tenant_side:
        data.closure.brokerage_tenant_side !== undefined
          ? String(paiseToRupees(data.closure.brokerage_tenant_side))
          : "",
      brokerage_owner_side:
        data.closure.brokerage_owner_side !== undefined
          ? String(paiseToRupees(data.closure.brokerage_owner_side))
          : "",
      notes: data.closure.notes ?? "",
    });
    setEditRentAgreement(data.closure.rent_agreement_storage_id ?? null);
    setEditAdditionalDocs(data.closure.additional_documents ?? []);
  }, [data.closure, form]);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    form.reset();
    setEditRentAgreement(data.closure.rent_agreement_storage_id ?? null);
    setEditAdditionalDocs(data.closure.additional_documents ?? []);
  }, [data.closure, form]);

  const onSubmitEdit = useCallback(
    async (values: EditClosureFormValues) => {
      setIsSubmitting(true);
      try {
        const moveInMs = new Date(`${values.move_in_date}T00:00:00+05:30`).getTime();

        const payload: Record<string, unknown> = {
          id: data.closure._id,
          move_in_date: moveInMs,
          demorentals_deal_id: values.demorentals_deal_id?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
          rent_agreement_storage_id: editRentAgreement ?? undefined,
          additional_documents: editAdditionalDocs.length > 0 ? editAdditionalDocs : undefined,
        };

        if (values.commission_amount !== undefined && values.commission_amount !== "") {
          payload.commission_amount = rupeesToPaise(Number(values.commission_amount));
        }
        if (values.brokerage_tenant_side !== undefined && values.brokerage_tenant_side !== "") {
          payload.brokerage_tenant_side = rupeesToPaise(Number(values.brokerage_tenant_side));
        }
        if (values.brokerage_owner_side !== undefined && values.brokerage_owner_side !== "") {
          payload.brokerage_owner_side = rupeesToPaise(Number(values.brokerage_owner_side));
        }

        await updateClosure(payload as Parameters<typeof updateClosure>[0]);
        toast.success("Closure updated");
        setIsEditing(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update closure");
      } finally {
        setIsSubmitting(false);
      }
    },
    [data.closure._id, updateClosure, editRentAgreement, editAdditionalDocs],
  );

  const renderEntityLink = (id: string | null | undefined, label: string, href: string) => {
    if (!id) {
      return <span>{label}</span>;
    }

    return (
      <Link href={href} className="text-blue-600 hover:underline">
        {label}
      </Link>
    );
  };

  const leadLabel = `${data.building?.name ?? "—"} / Fl${data.lead?.floor_number ?? "—"} / ${data.lead?.flat_number ?? "—"}`;

  const relatedItems: Array<{
    key: string;
    label: string;
    href: string;
    text: string;
    icon: React.ReactNode;
  }> = [];

  if (data.society?._id) {
    relatedItems.push({
      key: "society",
      label: "Society",
      href: `/admin/societies/${data.society._id}`,
      text: data.society.name,
      icon: <Building2 className="size-3.5" />,
    });
  }

  if (data.society?._id) {
    relatedItems.push({
      key: "flat",
      label: "Building / Flat",
      href: `/admin/societies/${data.society._id}`,
      text: leadLabel,
      icon: <Home className="size-3.5" />,
    });
  }

  if (data.lead?._id) {
    relatedItems.push({
      key: "lead",
      label: "Lead",
      href: `/admin/leads?id=${data.lead._id}`,
      text: `Lead #${data.lead._id.slice(0, 8)}`,
      icon: <ClipboardList className="size-3.5" />,
    });
  }

  if (data.closure.listing_id) {
    relatedItems.push({
      key: "listing",
      label: "Listing",
      href: `/admin/listings/${data.closure.listing_id}`,
      text: `Listing #${data.closure.listing_id.slice(0, 8)}`,
      icon: <FileText className="size-3.5" />,
    });
  }

  relatedItems.push({
    key: "closure",
    label: "Closure",
    href: `/admin/closures/${data.closure._id}`,
    text: `Closure #${data.closure._id.slice(0, 8)}`,
    icon: <Flag className="size-3.5" />,
  });

  return (
    <div className="space-y-6">
      {/* Deal Info */}
      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-900">Deal Info</CardTitle>
            {canEdit && !isTerminal && !isEditing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleStartEdit}
                className="gap-1.5 text-slate-600"
              >
                <Pencil className="size-3.5" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitEdit)} className="space-y-4">
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

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea rows={3} placeholder="Context, special terms..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DocumentUploader
                  mode="single"
                  label="Rent Agreement"
                  value={editRentAgreement}
                  onChange={setEditRentAgreement}
                />

                <DocumentUploader
                  mode="multi"
                  label="Additional Documents"
                  value={editAdditionalDocs}
                  onChange={setEditAdditionalDocs}
                />

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelEdit}
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
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-slate-500">DemoRentals Deal ID</dt>
                <dd className="font-medium text-slate-900">
                  {data.closure.demorentals_deal_id || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Move-In Date</dt>
                <dd className="font-medium text-slate-900">
                  {IST_DATE_FORMATTER.format(data.closure.move_in_date)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Created</dt>
                <dd className="text-slate-700">
                  {IST_DATETIME_FORMATTER.format(data.closure._creationTime)}
                </dd>
              </div>
              {data.closure.confirmed_at && (
                <div>
                  <dt className="text-slate-500">Confirmed</dt>
                  <dd className="text-slate-700">
                    {IST_DATETIME_FORMATTER.format(data.closure.confirmed_at)}
                  </dd>
                </div>
              )}
              {data.closure.notes && (
                <div className="col-span-2">
                  <dt className="text-slate-500">Notes</dt>
                  <dd className="text-slate-700">{data.closure.notes}</dd>
                </div>
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Financial Info */}
      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">Financial Info</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Commission</dt>
              <dd className="font-medium text-slate-900">
                {data.closure.commission_amount !== undefined
                  ? formatINR(data.closure.commission_amount)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Brokerage (Tenant)</dt>
              <dd className="font-medium text-slate-900">
                {data.closure.brokerage_tenant_side !== undefined
                  ? formatINR(data.closure.brokerage_tenant_side)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Brokerage (Owner)</dt>
              <dd className="font-medium text-slate-900">
                {data.closure.brokerage_owner_side !== undefined
                  ? formatINR(data.closure.brokerage_owner_side)
                  : "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Documents */}
      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-slate-500">Rent Agreement</p>
              {data.rent_agreement_url ? (
                <a
                  href={data.rent_agreement_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                >
                  View Document
                  <ExternalLink className="size-3.5" />
                </a>
              ) : (
                <p className="text-sm text-slate-400">Not uploaded</p>
              )}
            </div>

            {data.additional_document_urls.length > 0 && (
              <div>
                <p className="mb-2 text-sm text-slate-500">Additional Documents</p>
                <div className="space-y-2">
                  {data.additional_document_urls.map((doc) => (
                    <div key={doc.storage_id} className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-slate-700">{doc.name}</span>
                      {doc.url ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          View
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <span className="text-slate-400">Unavailable</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!data.rent_agreement_url && data.additional_document_urls.length === 0 && (
              <p className="text-sm text-slate-400">No documents uploaded</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Guard Info */}
      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">Guard Info</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Guard Name</dt>
              <dd className="font-medium text-slate-900">
                {renderEntityLink(
                  data.guard?.user_id,
                  data.guard?.name ?? "—",
                  `/admin/guards/${data.guard?.user_id}`,
                )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd className="text-slate-700">
                {data.guard?.phone ? `+91 ${data.guard.phone}` : "—"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Lead</dt>
              <dd className="font-medium text-slate-900">
                {renderEntityLink(data.lead?._id, leadLabel, `/admin/leads?id=${data.lead?._id}`)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Linked Listing */}
      {data.listing && (
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-900">Linked Listing</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/admin/listings/${data.listing._id}`}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              View Listing &rarr;
            </Link>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">Related</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {relatedItems.map((item) => (
            <div key={item.key} className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">{item.icon}</span>
              <span className="text-xs uppercase tracking-wide text-slate-500">{item.label}</span>
              <Link href={item.href} className="font-medium text-blue-600 hover:underline">
                {item.text}
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Payout Info */}
      <Card className="border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">Payout</CardTitle>
        </CardHeader>
        <CardContent>
          {data.payout ? (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <PayoutStatusBadge status={data.payout.status} />
                </dd>
              </div>
              {data.payout.amount_paise !== undefined && (
                <div>
                  <dt className="text-slate-500">Amount</dt>
                  <dd className="font-medium text-slate-900">
                    {formatINR(data.payout.amount_paise)}
                  </dd>
                </div>
              )}
              <div className="col-span-2">
                <Link
                  href={`/admin/payouts/${data.payout._id}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  View Payout
                </Link>
              </div>
              {data.closure.status === CLOSURE_STATUS.CANCELLED &&
                data.payout.status === PAYOUT_STATUS.VOIDED && (
                  <div className="col-span-2 text-sm text-slate-600">Payout voided</div>
                )}
            </dl>
          ) : data.closure.status === CLOSURE_STATUS.CONFIRMED ? (
            <div className="space-y-2">
              {canCreatePayout ? (
                <Button
                  type="button"
                  onClick={() => setIsCreatePayoutOpen(true)}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  Create Payout
                </Button>
              ) : (
                <p className="text-sm text-slate-600">No payout created yet.</p>
              )}
            </div>
          ) : data.closure.status === CLOSURE_STATUS.PENDING ? (
            <p className="text-sm text-slate-600">Payout available after closure is confirmed</p>
          ) : (
            <></>
          )}
        </CardContent>
      </Card>

      {canCreatePayout && (
        <CreatePayoutDialog
          open={isCreatePayoutOpen}
          onOpenChange={setIsCreatePayoutOpen}
          initialClosureId={data.closure._id}
        />
      )}
    </div>
  );
}
