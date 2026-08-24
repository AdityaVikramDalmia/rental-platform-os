"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Loader2,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  REGULATORY_STATUS,
  REGULATORY_ITEM_TYPE_LABELS,
  REGULATORY_STATUS_LABELS,
  type RegulatoryItemType,
  type RegulatoryStatus,
} from "../../../../../../lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type RegulatoryItem = {
  _id: Id<"regulatory_items">;
  closure_id: Id<"closures">;
  item_type: RegulatoryItemType;
  status: RegulatoryStatus;
  reference_number?: string;
  sla_deadline?: number;
  notes?: string;
  linked_document_ids: Id<"_storage">[];
};

type RegulatorySlaCardProps = {
  item: RegulatoryItem;
};

function statusColor(status: RegulatoryStatus) {
  switch (status) {
    case REGULATORY_STATUS.NOT_STARTED:
      return "bg-slate-100 text-slate-600";
    case REGULATORY_STATUS.IN_PROGRESS:
      return "bg-blue-100 text-blue-700";
    case REGULATORY_STATUS.SUBMITTED:
      return "bg-amber-100 text-amber-700";
    case REGULATORY_STATUS.APPROVED:
      return "bg-emerald-100 text-emerald-700";
    case REGULATORY_STATUS.REJECTED:
      return "bg-red-100 text-red-700";
    case REGULATORY_STATUS.OVERDUE:
      return "bg-red-100 text-red-700";
    case REGULATORY_STATUS.WAIVED:
      return "bg-slate-50 text-slate-400";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function slaUrgency(deadline: number | undefined): {
  label: string;
  className: string;
  icon: typeof Clock;
} {
  if (!deadline) {
    return { label: "No deadline", className: "text-slate-400", icon: Clock };
  }

  const now = Date.now();
  const diff = deadline - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (diff < 0) {
    const overdueDays = Math.abs(days);
    return {
      label: `${overdueDays}d overdue`,
      className: "text-red-600 font-semibold",
      icon: AlertTriangle,
    };
  }

  if (days <= 1) {
    return {
      label: "Due today",
      className: "text-red-600 font-semibold",
      icon: AlertTriangle,
    };
  }

  if (days <= 3) {
    return {
      label: `${days}d remaining`,
      className: "text-amber-600 font-medium",
      icon: Clock,
    };
  }

  return {
    label: `${days}d remaining`,
    className: "text-emerald-600",
    icon: Clock,
  };
}

export function RegulatorySlaCard({ item }: RegulatorySlaCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const updateStatus = useMutation(api.societyLiaison.updateStatus);

  const urgency = slaUrgency(item.sla_deadline);
  const UrgencyIcon = urgency.icon;

  async function handleTransition(newStatus: RegulatoryStatus) {
    setTransitioning(true);

    try {
      await updateStatus({
        regulatory_item_id: item._id,
        new_status: newStatus,
      });
      toast.success(`Updated to ${REGULATORY_STATUS_LABELS[newStatus]}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Status update failed");
    } finally {
      setTransitioning(false);
    }
  }

  function renderActions() {
    switch (item.status) {
      case REGULATORY_STATUS.NOT_STARTED:
        return (
          <Button
            type="button"
            size="sm"
            className="h-10 w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={transitioning}
            onClick={() => void handleTransition(REGULATORY_STATUS.IN_PROGRESS)}
          >
            {transitioning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Shield className="size-4" />
            )}
            Start Processing
          </Button>
        );
      case REGULATORY_STATUS.IN_PROGRESS:
        return (
          <Button
            type="button"
            size="sm"
            className="h-10 w-full gap-2 bg-blue-600 text-white hover:bg-blue-700"
            disabled={transitioning}
            onClick={() => void handleTransition(REGULATORY_STATUS.SUBMITTED)}
          >
            {transitioning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileText className="size-4" />
            )}
            Mark Submitted
          </Button>
        );
      case REGULATORY_STATUS.SUBMITTED:
        return (
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-700">
            <Clock className="size-3.5" />
            Awaiting approval
          </div>
        );
      case REGULATORY_STATUS.OVERDUE:
        return (
          <Button
            type="button"
            size="sm"
            className="h-10 w-full gap-2 bg-amber-600 text-white hover:bg-amber-700"
            disabled={transitioning}
            onClick={() => void handleTransition(REGULATORY_STATUS.IN_PROGRESS)}
          >
            {transitioning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Shield className="size-4" />
            )}
            Resume Processing
          </Button>
        );
      case REGULATORY_STATUS.REJECTED:
        return (
          <Button
            type="button"
            size="sm"
            className="h-10 w-full gap-2 bg-amber-600 text-white hover:bg-amber-700"
            disabled={transitioning}
            onClick={() => void handleTransition(REGULATORY_STATUS.IN_PROGRESS)}
          >
            {transitioning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Shield className="size-4" />
            )}
            Reprocess
          </Button>
        );
      case REGULATORY_STATUS.APPROVED:
        return (
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700">
            <Shield className="size-3.5" />
            Approved — Complete
          </div>
        );
      case REGULATORY_STATUS.WAIVED:
        return (
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-400">
            Waived
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm">
      <CardContent className="p-3">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-2 text-left"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="size-3.5 shrink-0 text-slate-400" />
              <p className="text-sm font-medium text-slate-900">
                {REGULATORY_ITEM_TYPE_LABELS[item.item_type]}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={`text-[10px] font-semibold ${statusColor(item.status)}`}
              >
                {REGULATORY_STATUS_LABELS[item.status]}
              </Badge>
              <span className={`flex items-center gap-1 text-xs ${urgency.className}`}>
                <UrgencyIcon className="size-3" />
                {urgency.label}
              </span>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="mt-0.5 size-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronDown className="mt-0.5 size-4 shrink-0 text-slate-400" />
          )}
        </button>

        {expanded ? (
          <div className="mt-3 space-y-3">
            <Separator />

            <div className="space-y-2 text-xs">
              {item.reference_number ? (
                <div className="flex justify-between">
                  <span className="text-slate-500">Reference #</span>
                  <span className="font-medium text-slate-900">{item.reference_number}</span>
                </div>
              ) : null}
              {item.sla_deadline ? (
                <div className="flex justify-between">
                  <span className="text-slate-500">Deadline</span>
                  <span className="font-medium text-slate-900">
                    {new Intl.DateTimeFormat("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "Asia/Kolkata",
                    }).format(new Date(item.sla_deadline))}
                  </span>
                </div>
              ) : null}
              {item.notes ? (
                <div>
                  <span className="text-slate-500">Notes</span>
                  <p className="mt-0.5 text-slate-700">{item.notes}</p>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-slate-500">Linked docs</span>
                <span className="font-medium text-slate-900">
                  {item.linked_document_ids.length}
                </span>
              </div>
            </div>

            {renderActions()}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
