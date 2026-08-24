"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  NEGOTIATION_CHECKLIST_ITEM_STATUS,
  NEGOTIATION_CHECKLIST_ITEM_STATUS_COLORS,
  NEGOTIATION_CHECKLIST_ITEM_STATUS_LABELS,
  NEGOTIATION_STATUS,
  type NegotiationChecklistItemStatus,
} from "../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { RentAgreementUpload } from "./RentAgreementUpload";

interface MandatoryChecklistProps {
  negotiationId: Id<"negotiations">;
  canManage: boolean;
  isAdmin: boolean;
  onClosureReady?: () => void;
}

type ManualChecklistItemKey =
  | "police_verification_status"
  | "society_noc_status"
  | "owner_kyc_status"
  | "rent_agreement_status"
  | "key_handover_status"
  | "move_in_inspection_status";

const MANUAL_ITEM_CONFIG: Array<{
  key: ManualChecklistItemKey;
  label: string;
  options: readonly NegotiationChecklistItemStatus[];
  supportsUpload?: boolean;
  supportsNotes?: boolean;
}> = [
  {
    key: "police_verification_status",
    label: "Police Verification",
    options: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.IN_PROGRESS,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.COMPLETED,
    ],
  },
  {
    key: "society_noc_status",
    label: "Society NOC",
    options: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.OBTAINED,
    ],
  },
  {
    key: "owner_kyc_status",
    label: "Owner KYC",
    options: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.VERIFIED,
    ],
  },
  {
    key: "rent_agreement_status",
    label: "Rent Agreement",
    options: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.DRAFT_READY,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.STAMP_REGISTERED,
    ],
    supportsUpload: true,
  },
  {
    key: "key_handover_status",
    label: "Key Handover",
    options: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.COMPLETED,
    ],
  },
  {
    key: "move_in_inspection_status",
    label: "Move-in Inspection",
    options: [
      NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING,
      NEGOTIATION_CHECKLIST_ITEM_STATUS.COMPLETED,
    ],
    supportsNotes: true,
  },
];

const AUTO_ITEMS: Array<{ key: keyof ChecklistAutoItems; label: string }> = [
  { key: "terms_agreed", label: "Terms Agreed" },
  { key: "both_parties_signed", label: "Both Parties Signed" },
  { key: "token_collected", label: "Token Collected" },
  { key: "brokerage_recorded", label: "Brokerage Recorded" },
];

type ChecklistAutoItems = {
  terms_agreed: boolean;
  both_parties_signed: boolean;
  token_collected: boolean;
  brokerage_recorded: boolean;
};

const EDITABLE_NEGOTIATION_STATUSES = new Set<string>([
  NEGOTIATION_STATUS.TOKEN_COLLECTED,
  NEGOTIATION_STATUS.DOCUMENTATION_IN_PROGRESS,
]);

export function MandatoryChecklist({
  negotiationId,
  canManage,
  isAdmin,
  onClosureReady,
}: MandatoryChecklistProps) {
  const checklist = useQuery(api.negotiationChecklist.getChecklistStatus, {
    negotiation_id: negotiationId,
  });

  const updateChecklistItem = useMutation(api.negotiationChecklist.updateChecklistItem);
  const waiveItem = useMutation(api.negotiationChecklist.waiveItem);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [waiveItemKey, setWaiveItemKey] = useState<ManualChecklistItemKey | null>(null);
  const [waiveReason, setWaiveReason] = useState("");
  const [inspectionNotes, setInspectionNotes] = useState("");

  const previousReadyRef = useRef(false);

  useEffect(() => {
    if (!checklist) {
      return;
    }
    setInspectionNotes(checklist.manual_items.move_in_inspection_status.notes ?? "");
  }, [checklist]);

  useEffect(() => {
    const isReady = Boolean(checklist?.is_ready_for_closure);
    if (isReady && !previousReadyRef.current && canManage) {
      onClosureReady?.();
    }
    previousReadyRef.current = isReady;
  }, [canManage, checklist?.is_ready_for_closure, onClosureReady]);

  const progressPercent = useMemo(() => {
    if (!checklist || checklist.total_items === 0) {
      return 0;
    }
    return Math.round((checklist.completed_items_count / checklist.total_items) * 100);
  }, [checklist]);

  const isChecklistEditableByStatus =
    checklist !== undefined && checklist !== null
      ? EDITABLE_NEGOTIATION_STATUSES.has(checklist.negotiation_status)
      : false;
  const canEditChecklist = canManage && isChecklistEditableByStatus;
  const readOnlyMessage = !canManage
    ? "View-only access. Checklist edits are disabled."
    : !isChecklistEditableByStatus
      ? "Checklist available after token collection."
      : null;

  if (checklist === undefined) {
    return (
      <Card className="border-slate-200 py-0">
        <CardContent className="flex items-center gap-2 px-4 py-4 text-sm text-slate-600">
          <Loader2 className="size-4 animate-spin" />
          Loading checklist...
        </CardContent>
      </Card>
    );
  }

  async function handleStatusChange(
    itemKey: ManualChecklistItemKey,
    status: NegotiationChecklistItemStatus,
  ) {
    if (!canEditChecklist) {
      return;
    }

    setBusyKey(`status:${itemKey}`);
    try {
      await updateChecklistItem({
        negotiation_id: negotiationId,
        item_key: itemKey,
        status,
      });
      toast.success("Checklist item updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update checklist item");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSaveInspectionNotes() {
    if (!checklist || !canEditChecklist) {
      return;
    }

    const currentStatus = checklist.manual_items.move_in_inspection_status.status;
    if (currentStatus === NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED) {
      toast.error("Inspection is waived. Unwaive before adding notes.");
      return;
    }

    setBusyKey("notes:move_in_inspection_status");
    try {
      await updateChecklistItem({
        negotiation_id: negotiationId,
        item_key: "move_in_inspection_status",
        status: currentStatus,
        notes: inspectionNotes.trim() || undefined,
      });
      toast.success("Inspection notes saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save inspection notes");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleConfirmWaive() {
    if (!waiveItemKey || !canEditChecklist || !isAdmin) {
      return;
    }

    const reason = waiveReason.trim();
    if (!reason) {
      toast.error("Waive reason is required");
      return;
    }

    setBusyKey(`waive:${waiveItemKey}`);
    try {
      await waiveItem({
        negotiation_id: negotiationId,
        item_key: waiveItemKey,
        waive_reason: reason,
      });
      toast.success("Checklist item waived");
      setWaiveItemKey(null);
      setWaiveReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to waive checklist item");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleUnwaive(itemKey: ManualChecklistItemKey) {
    if (!canEditChecklist || !isAdmin) {
      return;
    }

    setBusyKey(`status:${itemKey}`);
    try {
      await updateChecklistItem({
        negotiation_id: negotiationId,
        item_key: itemKey,
        status: NEGOTIATION_CHECKLIST_ITEM_STATUS.PENDING,
      });
      toast.success("Checklist item unwaived");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unwaive checklist item");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 py-0">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base text-slate-900">Mandatory Checklist</CardTitle>
          <CardDescription>Complete all 10 items before closure can be created.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Auto-Validated Items
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {AUTO_ITEMS.map((item) => {
                const isDone = checklist.auto_items[item.key];
                return (
                  <div
                    key={item.key}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2",
                      isDone ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50",
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      {isDone ? (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      ) : (
                        <XCircle className="size-4 text-slate-400" />
                      )}
                      {item.label}
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-semibold">
                      Auto-verified
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Documentation and Verification
            </p>

            {readOnlyMessage ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                {readOnlyMessage}
              </p>
            ) : null}

            {MANUAL_ITEM_CONFIG.map((item) => {
              const itemState = checklist.manual_items[item.key];
              const isWaived = itemState.status === NEGOTIATION_CHECKLIST_ITEM_STATUS.WAIVED;
              const isBusy =
                busyKey === `status:${item.key}` ||
                busyKey === `waive:${item.key}` ||
                busyKey === `notes:${item.key}`;
              const isReadOnlyItem = isBusy || !canEditChecklist;
              const canShowWaiveAction = isAdmin && item.key !== "rent_agreement_status";

              return (
                <div key={item.key} className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[11px] font-semibold",
                        NEGOTIATION_CHECKLIST_ITEM_STATUS_COLORS[itemState.status],
                      )}
                    >
                      {NEGOTIATION_CHECKLIST_ITEM_STATUS_LABELS[itemState.status]}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isWaived ? (
                      <p className="text-xs font-medium text-amber-700">Waived by admin</p>
                    ) : !canEditChecklist ? (
                      <p className="text-xs font-medium text-slate-600">Read-only</p>
                    ) : (
                      <Select
                        value={itemState.status}
                        onValueChange={(value) =>
                          handleStatusChange(item.key, value as NegotiationChecklistItemStatus)
                        }
                        disabled={isReadOnlyItem}
                      >
                        <SelectTrigger className="w-full sm:w-56">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {item.options.map((option) => (
                            <SelectItem key={option} value={option}>
                              {NEGOTIATION_CHECKLIST_ITEM_STATUS_LABELS[option]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {canShowWaiveAction ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          isWaived ? handleUnwaive(item.key) : setWaiveItemKey(item.key)
                        }
                        disabled={isReadOnlyItem}
                      >
                        {isBusy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : isWaived ? (
                          <CheckCircle2 className="size-3.5" />
                        ) : (
                          <AlertCircle className="size-3.5" />
                        )}
                        {isWaived ? "Unwaive" : "Waive"}
                      </Button>
                    ) : null}
                  </div>

                  {itemState.waive_reason ? (
                    <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                      Reason: {itemState.waive_reason}
                    </p>
                  ) : null}

                  {item.supportsUpload ? (
                    <RentAgreementUpload
                      negotiationId={negotiationId}
                      currentFileId={
                        checklist.manual_items.rent_agreement_status.rent_agreement_file_id
                      }
                      canManage={canEditChecklist}
                      onUploadSuccess={() => undefined}
                    />
                  ) : null}

                  {item.supportsNotes ? (
                    <div className="space-y-2">
                      <Textarea
                        value={inspectionNotes}
                        onChange={(event) => setInspectionNotes(event.target.value)}
                        rows={3}
                        placeholder="Add move-in inspection notes"
                        disabled={isWaived || isReadOnlyItem}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleSaveInspectionNotes}
                        disabled={isWaived || isReadOnlyItem}
                      >
                        {busyKey === "notes:move_in_inspection_status" ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="size-3.5" />
                        )}
                        Save Notes
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between text-sm">
              <p className="font-medium text-slate-900">Progress</p>
              <p className="font-semibold text-slate-700">
                {checklist.completed_items_count}/{checklist.total_items}
              </p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {checklist.is_ready_for_closure ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                Ready for Closure
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                Complete all checklist items to enable closure creation
              </div>
            )}

            <Button
              type="button"
              className="w-full"
              disabled={!checklist.is_ready_for_closure || !canManage}
              onClick={() => {
                if (checklist.is_ready_for_closure && canManage) {
                  if (onClosureReady) {
                    onClosureReady();
                  } else {
                    toast.success("Checklist complete. You can create closure now.");
                  }
                }
              }}
            >
              Create Closure
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={waiveItemKey !== null}
        onOpenChange={(open) => {
          if (!open || !canEditChecklist || !isAdmin) {
            setWaiveItemKey(null);
            setWaiveReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waive Checklist Item</DialogTitle>
            <DialogDescription>
              Add a mandatory reason for waiving this item. This action is audited.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={waiveReason}
            onChange={(event) => setWaiveReason(event.target.value)}
            rows={4}
            placeholder="Enter waive reason"
            disabled={!canEditChecklist || Boolean(busyKey && busyKey.startsWith("waive:"))}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setWaiveItemKey(null);
                setWaiveReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                !canEditChecklist ||
                waiveReason.trim().length === 0 ||
                Boolean(busyKey?.startsWith("waive:"))
              }
              onClick={handleConfirmWaive}
            >
              {busyKey?.startsWith("waive:") ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm Waive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type { MandatoryChecklistProps };
