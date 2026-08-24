"use client";

import { useQuery } from "convex/react";
import { X } from "lucide-react";
import { useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  OWNER_SERVICE_REQUEST_STATUS,
  OWNER_SERVICE_REQUEST_STATUS_COLORS,
  OWNER_SERVICE_REQUEST_STATUS_LABELS,
} from "../../../../../../lib/constants";
import { formatINR } from "../../../../../../lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ActivateDialog } from "./activate-dialog";
import { ContactDialog } from "./contact-dialog";
import { DropDialog } from "./drop-dialog";
import { OnboardDialog } from "./onboard-dialog";
import { RejectDialog } from "./reject-dialog";

type RequestDetailPanelProps = {
  requestId: Id<"owner_service_requests">;
  onClose: () => void;
  canManage: boolean;
};

export function RequestDetailPanel({ requestId, onClose, canManage }: RequestDetailPanelProps) {
  const request = useQuery(api.ownerServiceRequests.getById, { id: requestId });

  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDropDialog, setShowDropDialog] = useState(false);
  const [showOnboardDialog, setShowOnboardDialog] = useState(false);
  const [showActivateDialog, setShowActivateDialog] = useState(false);

  if (!request) {
    return <div className="flex h-full items-center justify-center text-slate-400">Loading...</div>;
  }

  const statusColor =
    OWNER_SERVICE_REQUEST_STATUS_COLORS[
      request.status as keyof typeof OWNER_SERVICE_REQUEST_STATUS_COLORS
    ] ?? "bg-gray-100 text-gray-500";

  const statusLabel =
    OWNER_SERVICE_REQUEST_STATUS_LABELS[
      request.status as keyof typeof OWNER_SERVICE_REQUEST_STATUS_LABELS
    ] ?? request.status;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge className={cn("text-xs font-medium", statusColor)}>{statusLabel}</Badge>
          <span className="text-xs text-slate-400">
            {new Date(request._creationTime).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100">
          <X className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Owner
          </h3>
          <div className="space-y-1">
            <p className="font-medium text-slate-900">{request.name}</p>
            <a
              href={`tel:+91${request.phone}`}
              className="text-sm text-slate-600 underline decoration-dotted underline-offset-2 hover:text-slate-900"
            >
              +91 {request.phone}
            </a>
            {request.email ? <p className="text-sm text-slate-600">{request.email}</p> : null}
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Property
          </h3>
          <div className="space-y-1 text-sm text-slate-700">
            {request.property_type ? (
              <p>
                <span className="text-slate-500">Type:</span> {request.property_type}
              </p>
            ) : null}
            {request.location ? (
              <p>
                <span className="text-slate-500">Location:</span> {request.location}
              </p>
            ) : null}
            {request.property_value !== undefined ? (
              <p>
                <span className="text-slate-500">Est. Value:</span>{" "}
                {formatINR(request.property_value)}
              </p>
            ) : null}
            {!request.property_type && !request.location && request.property_value === undefined ? (
              <p className="text-slate-400">No property details provided.</p>
            ) : null}
          </div>
        </div>

        {request.notes ? (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Notes from Owner
              </h3>
              <p className="text-sm text-slate-700">{request.notes}</p>
            </div>
          </>
        ) : null}

        {request.contacted_at ? (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Timeline
              </h3>
              <div className="space-y-1 text-sm text-slate-700">
                <p>
                  <span className="text-slate-500">Contacted:</span>{" "}
                  {new Date(request.contacted_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {request.assigned_admin_name ? (
                    <span className="text-slate-400"> by {request.assigned_admin_name}</span>
                  ) : null}
                </p>
              </div>
            </div>
          </>
        ) : null}

        {request.ops_notes ? (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Internal Notes
              </h3>
              <p className="text-sm text-slate-700">{request.ops_notes}</p>
            </div>
          </>
        ) : null}

        {request.owner_workos_id ? (
          <>
            <Separator />
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                WorkOS Account
              </h3>
              <p className="text-xs font-mono text-slate-500">{request.owner_workos_id}</p>
              <p className="mt-1 text-xs text-slate-400">
                Owner can sign in with Google using {request.email ?? "their email"}.
              </p>
            </div>
          </>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-slate-200 p-4">
        {!canManage ? (
          <p className="text-sm text-slate-500">
            You do not have permission to manage owner request status transitions.
          </p>
        ) : null}

        {canManage && request.status === OWNER_SERVICE_REQUEST_STATUS.SUBMITTED ? (
          <>
            <Button
              type="button"
              className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => setShowContactDialog(true)}
            >
              Mark as Contacted
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => setShowRejectDialog(true)}
            >
              Reject
            </Button>
          </>
        ) : null}

        {canManage && request.status === OWNER_SERVICE_REQUEST_STATUS.CONTACTED ? (
          <>
            <Button
              type="button"
              className="w-full bg-green-600 text-white hover:bg-green-700"
              onClick={() => setShowOnboardDialog(true)}
            >
              Onboard Owner
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full text-slate-600"
              onClick={() => setShowDropDialog(true)}
            >
              Drop
            </Button>
          </>
        ) : null}

        {canManage && request.status === OWNER_SERVICE_REQUEST_STATUS.ONBOARDED ? (
          <Button
            type="button"
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => setShowActivateDialog(true)}
          >
            Activate Owner
          </Button>
        ) : null}
      </div>

      <ContactDialog
        open={showContactDialog}
        onOpenChange={setShowContactDialog}
        requestId={requestId}
      />
      <RejectDialog
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        requestId={requestId}
      />
      <DropDialog open={showDropDialog} onOpenChange={setShowDropDialog} requestId={requestId} />
      <OnboardDialog
        open={showOnboardDialog}
        onOpenChange={setShowOnboardDialog}
        requestId={requestId}
        ownerName={request.name}
        ownerEmail={request.email}
      />
      <ActivateDialog
        open={showActivateDialog}
        onOpenChange={setShowActivateDialog}
        requestId={requestId}
        ownerName={request.name}
      />
    </div>
  );
}
