"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowRight, CheckCircle2, Loader2, Send, ShieldAlert, TriangleAlert } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  NEGOTIATION_ROOM_TYPE,
  NEGOTIATION_STATUS,
  NEGOTIATION_STATUS_COLORS,
  NEGOTIATION_STATUS_LABELS,
  PERMISSIONS,
  type NegotiationRoomType,
} from "../../../../../../lib/constants";
import { formatDateTime } from "../../../../../../lib/dates";
import { isNegotiationTerminal } from "../../../../../../lib/negotiation";
import { isValidConvexId } from "../../../../../../lib/validators";
import { ProposalEditor } from "@/components/negotiation/ProposalEditor";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { NegotiationRoomTabs } from "./components/negotiation-room-tabs";
import { NegotiationFlags } from "../components/negotiation-flags";
import { NegotiationSidebar } from "./components/negotiation-sidebar";
import { NegotiationStatusTimeline } from "./components/negotiation-status-timeline";

type FailureAction = "failed" | "expired";

const ROOM_TYPE_LABELS: Record<NegotiationRoomType, string> = {
  [NEGOTIATION_ROOM_TYPE.OPS_TENANT]: "OPS ↔ Tenant",
  [NEGOTIATION_ROOM_TYPE.OPS_OWNER]: "OPS ↔ Owner",
  [NEGOTIATION_ROOM_TYPE.COMBINED]: "Combined",
};

export default function NegotiationDetailPage() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const rawNegotiationId = params.id;
  const negotiationIdParam = Array.isArray(rawNegotiationId)
    ? rawNegotiationId[0]
    : rawNegotiationId;
  const hasValidNegotiationId =
    typeof negotiationIdParam === "string" && isValidConvexId(negotiationIdParam);
  const negotiationId = hasValidNegotiationId ? (negotiationIdParam as Id<"negotiations">) : null;

  const currentUser = useQuery(api.users.getCurrentUser);
  const roleAssignments = useQuery(
    api.userRoleAssignments.getByUserId,
    currentUser ? { user_id: currentUser._id } : "skip",
  );

  const permissionSet = useMemo(() => {
    const permissions = new Set<string>();
    if (!roleAssignments) {
      return permissions;
    }

    for (const assignment of roleAssignments) {
      for (const permission of assignment.role.permissions) {
        permissions.add(permission);
      }
    }

    return permissions;
  }, [roleAssignments]);

  const hasNegotiationsView = permissionSet.has(PERMISSIONS.NEGOTIATIONS_VIEW);
  const hasNegotiationsManage = permissionSet.has(PERMISSIONS.NEGOTIATIONS_MANAGE);

  const detail = useQuery(
    api.negotiations.getDetailForAdmin,
    hasNegotiationsView && negotiationId ? { negotiation_id: negotiationId } : "skip",
  );
  const rooms = useQuery(
    api.negotiations.listRoomsForNegotiation,
    hasNegotiationsView && negotiationId ? { negotiation_id: negotiationId } : "skip",
  );
  const activeProposal = useQuery(
    api.negotiationProposals.getActiveProposal,
    hasNegotiationsView && negotiationId ? { negotiation_id: negotiationId } : "skip",
  );
  const proposalHistory = useQuery(
    api.negotiationProposals.getProposalHistory,
    hasNegotiationsView && negotiationId ? { negotiation_id: negotiationId } : "skip",
  );
  const tokenRecord = useQuery(
    api.negotiationTokens.getForNegotiation,
    hasNegotiationsView && negotiationId ? { negotiation_id: negotiationId } : "skip",
  );

  const markFailed = useMutation(api.negotiations.markFailed);
  const markExpired = useMutation(api.negotiations.markExpired);
  const shareProposal = useMutation(api.negotiationProposals.share);

  const [isCreateProposalOpen, setIsCreateProposalOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [failureAction, setFailureAction] = useState<FailureAction | null>(null);
  const [failureReason, setFailureReason] = useState("");
  const [selectedShareRooms, setSelectedShareRooms] = useState<NegotiationRoomType[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableRoomTypes = useMemo(() => {
    if (!rooms) {
      return [];
    }

    const types = new Set<NegotiationRoomType>();
    for (const room of rooms) {
      if (
        room.channel_type === NEGOTIATION_ROOM_TYPE.OPS_TENANT ||
        room.channel_type === NEGOTIATION_ROOM_TYPE.OPS_OWNER ||
        room.channel_type === NEGOTIATION_ROOM_TYPE.COMBINED
      ) {
        types.add(room.channel_type);
      }
    }

    return Array.from(types);
  }, [rooms]);

  if (currentUser === undefined || roleAssignments === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (
    !currentUser ||
    !(
      currentUser.user_types?.some((t) => t === "ADMIN" || t === "OPS") ??
      (currentUser.user_type === "ADMIN" || currentUser.user_type === "OPS")
    )
  ) {
    return null;
  }

  if (!hasNegotiationsView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view negotiations.
      </div>
    );
  }

  if (!hasValidNegotiationId || !negotiationId) {
    return <NegotiationNotFound />;
  }

  if (
    detail === undefined ||
    rooms === undefined ||
    activeProposal === undefined ||
    proposalHistory === undefined ||
    tokenRecord === undefined
  ) {
    return <NegotiationDetailSkeleton />;
  }

  if (detail === null) {
    return <NegotiationNotFound />;
  }

  const {
    negotiation,
    listing,
    tenant,
    owner,
    initiated_by: initiatedBy,
    days_in_status: daysInStatus,
  } = detail;
  const statusColor =
    NEGOTIATION_STATUS_COLORS[negotiation.status as keyof typeof NEGOTIATION_STATUS_COLORS] ??
    "bg-slate-100 text-slate-700";
  const statusLabel =
    NEGOTIATION_STATUS_LABELS[negotiation.status as keyof typeof NEGOTIATION_STATUS_LABELS] ??
    negotiation.status;
  const isAdminUser =
    currentUser.user_types?.includes("ADMIN") ?? currentUser.user_type === "ADMIN";
  const canManage = hasNegotiationsManage;
  const canManageFailureStatus = canManage && isAdminUser;
  const canCreateClosure = negotiation.status === NEGOTIATION_STATUS.READY_FOR_CLOSURE;
  const isTerminalStatus = isNegotiationTerminal(negotiation.status);
  const canCreateProposal = !isTerminalStatus && !canCreateClosure;
  const canMarkFailed =
    negotiation.status !== NEGOTIATION_STATUS.FAILED &&
    negotiation.status !== NEGOTIATION_STATUS.CLOSED &&
    negotiation.status !== NEGOTIATION_STATUS.EXPIRED;
  const canMarkExpired =
    negotiation.status !== NEGOTIATION_STATUS.EXPIRED &&
    negotiation.status !== NEGOTIATION_STATUS.CLOSED &&
    negotiation.status !== NEGOTIATION_STATUS.FAILED;
  const createProposalDisabledReason = isTerminalStatus
    ? "Cannot create proposals for terminal negotiations"
    : canCreateClosure
      ? "Negotiation is ready for closure"
      : undefined;
  const markFailedDisabledReason = canMarkFailed
    ? undefined
    : `Cannot mark failed from ${statusLabel} status`;
  const markExpiredDisabledReason = canMarkExpired
    ? undefined
    : `Cannot mark expired from ${statusLabel} status`;

  async function handleShareActiveProposal() {
    if (!activeProposal) {
      toast.error("No active proposal found");
      return;
    }

    if (selectedShareRooms.length === 0) {
      toast.error("Select at least one room to share");
      return;
    }

    setIsSubmitting(true);
    try {
      await shareProposal({
        proposal_id: activeProposal.proposal._id,
        room_types: selectedShareRooms,
      });
      toast.success("Proposal shared to selected rooms");
      setIsShareDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to share proposal");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFailureStatusUpdate() {
    if (!canManageFailureStatus) {
      toast.error("Only admins with manage access can update this status");
      return;
    }

    const trimmedReason = failureReason.trim();
    if (!failureAction || !trimmedReason) {
      toast.error("Reason is required");
      return;
    }

    setIsSubmitting(true);
    try {
      if (failureAction === "failed") {
        await markFailed({
          negotiation_id: negotiation._id,
          failure_reason: trimmedReason,
        });
        toast.success("Negotiation marked as failed");
      } else {
        await markExpired({
          negotiation_id: negotiation._id,
          failure_reason: trimmedReason,
        });
        toast.success("Negotiation marked as expired");
      }

      setFailureAction(null);
      setFailureReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update negotiation status");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Negotiations", href: "/admin/negotiations" },
          { label: `Negotiation #${negotiation._id.slice(-6)}` },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Negotiation #{negotiation._id.slice(-6)}
            </h2>
            <Badge variant="secondary" className={cn("font-semibold", statusColor)}>
              {statusLabel}
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            Opened {formatDateTime(negotiation.initiated_at)} · {daysInStatus} day(s) in current
            stage
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateProposalOpen(true)}
                disabled={!canCreateProposal}
                title={createProposalDisabledReason}
              >
                Create Proposal
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!activeProposal || availableRoomTypes.length === 0}
                onClick={() => {
                  setSelectedShareRooms(availableRoomTypes);
                  setIsShareDialogOpen(true);
                }}
              >
                <Send className="size-4" />
                Share to Room
              </Button>
              {canManageFailureStatus ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    disabled={!canMarkFailed}
                    title={markFailedDisabledReason}
                    onClick={() => {
                      setFailureReason("");
                      setFailureAction("failed");
                    }}
                  >
                    <ShieldAlert className="size-4" />
                    Mark Failed
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    disabled={!canMarkExpired}
                    title={markExpiredDisabledReason}
                    onClick={() => {
                      setFailureReason("");
                      setFailureAction("expired");
                    }}
                  >
                    <TriangleAlert className="size-4" />
                    Mark Expired
                  </Button>
                </>
              ) : null}
            </>
          ) : null}

          {canCreateClosure && canManage ? (
            <Button
              type="button"
              onClick={() => router.push(`/admin/closures?negotiation_id=${negotiation._id}`)}
            >
              <CheckCircle2 className="size-4" />
              Create Closure
              <ArrowRight className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <MetaItem
          label="Listing"
          value={listing ? `${listing.bhk_config} · /listing/${listing.slug}` : "-"}
        />
        <MetaItem label="Tenant" value={tenant?.name ?? "-"} />
        <MetaItem label="Owner" value={owner?.name ?? "Owner unlinked"} />
        <MetaItem label="Initiated by" value={initiatedBy?.name ?? "-"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <NegotiationRoomTabs
            rooms={rooms}
            currentUserId={currentUser._id}
            currentUserRole={(currentUser.active_persona ?? currentUser.user_type) as string}
          />
          <NegotiationStatusTimeline negotiation={negotiation} />
        </div>

        <div className="space-y-4">
          <NegotiationFlags
            negotiationId={negotiation._id}
            flags={detail.flags}
            flagDismissedAt={negotiation.flag_dismissed_at}
            flagDismissedReason={negotiation.flag_dismissed_reason}
            canManage={canManage}
          />
          <NegotiationSidebar
            negotiationId={negotiation._id}
            activeProposal={activeProposal}
            proposalHistory={proposalHistory}
            tokenRecord={tokenRecord}
            canManage={canManage}
            isAdmin={isAdminUser}
            onClosureReady={() => {
              router.push(`/admin/closures?negotiation_id=${negotiation._id}`);
            }}
          />
        </div>
      </div>

      <Dialog
        open={isCreateProposalOpen}
        onOpenChange={(open) => {
          if (!isSubmitting) {
            setIsCreateProposalOpen(open);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Proposal</DialogTitle>
          </DialogHeader>
          <ProposalEditor
            negotiationId={negotiation._id}
            onSuccess={() => {
              setIsCreateProposalOpen(false);
            }}
            onCancel={() => setIsCreateProposalOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={isShareDialogOpen}
        onOpenChange={(open) => {
          if (!isSubmitting) {
            setIsShareDialogOpen(open);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Proposal to Rooms</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {availableRoomTypes.map((roomType) => {
              const checkboxId = `share-room-${roomType.toLowerCase()}`;

              return (
                <div
                  key={roomType}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                >
                  <label htmlFor={checkboxId} className="cursor-pointer text-sm text-slate-800">
                    {ROOM_TYPE_LABELS[roomType]}
                  </label>
                  <Checkbox
                    id={checkboxId}
                    checked={selectedShareRooms.includes(roomType)}
                    onCheckedChange={(checked) => {
                      setSelectedShareRooms((previous) => {
                        if (checked) {
                          return previous.includes(roomType) ? previous : [...previous, roomType];
                        }
                        return previous.filter((value) => value !== roomType);
                      });
                    }}
                  />
                </div>
              );
            })}
            {availableRoomTypes.length === 0 ? (
              <p className="text-sm text-slate-500">No active rooms available for sharing.</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setIsShareDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSubmitting || selectedShareRooms.length === 0}
              onClick={handleShareActiveProposal}
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={failureAction !== null}
        onOpenChange={(open) => {
          if (!isSubmitting && !open) {
            setFailureAction(null);
            setFailureReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {failureAction === "failed"
                ? "Mark Negotiation as Failed"
                : "Mark Negotiation as Expired"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={failureReason}
            onChange={(event) => setFailureReason(event.target.value)}
            rows={4}
            placeholder="Add a mandatory reason"
            disabled={isSubmitting}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => {
                setFailureAction(null);
                setFailureReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isSubmitting || failureReason.trim().length === 0}
              onClick={handleFailureStatusUpdate}
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  );
}

function NegotiationNotFound() {
  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: "Admin", href: "/admin/dashboard" },
          { label: "Negotiations", href: "/admin/negotiations" },
          { label: "Not Found" },
        ]}
      />
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
        Negotiation not found.
      </div>
    </div>
  );
}

function NegotiationDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-64" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Skeleton className="h-[560px]" />
        <Skeleton className="h-[560px]" />
      </div>
    </div>
  );
}
