"use client";

import { useMutation, useQuery } from "convex/react";
import { Copy, Loader2, Mail, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  OWNER_INVITE_STATUS,
  OWNER_INVITE_STATUS_COLORS,
  OWNER_INVITE_STATUS_LABELS,
  type OwnerInviteStatus,
} from "../../../../../../lib/constants";
import { formatDateTime } from "../../../../../../lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type OwnerInviteSectionProps = {
  inquiryId: Id<"tenant_inquiries">;
  channelId?: Id<"chat_channels">;
  canManage: boolean;
};

function formatTimeRemaining(expiresAt: number): string {
  const remainingMs = expiresAt - Date.now();

  if (remainingMs <= 0) {
    return "Expired";
  }

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h left`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }

  return `${minutes}m left`;
}

function StatusBadge({ status }: { status: OwnerInviteStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent text-xs font-semibold",
        OWNER_INVITE_STATUS_COLORS[status] ?? "bg-slate-100 text-slate-600",
      )}
    >
      {OWNER_INVITE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function OwnerInviteSection({ inquiryId, channelId, canManage }: OwnerInviteSectionProps) {
  const invite = useQuery(
    api.ownerInvites.getForInquiry,
    canManage ? { inquiry_id: inquiryId } : "skip",
  );
  const generateInvite = useMutation(api.ownerInvites.generateInvite);
  const regenerateInvite = useMutation(api.ownerInvites.regenerateInvite);

  const [ownerExpectedEmail, setOwnerExpectedEmail] = useState("");
  const [pendingAction, setPendingAction] = useState<"generate" | "regenerate" | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const inviteUrl = useMemo(() => {
    if (!invite || !origin) {
      return "";
    }

    return `${origin}/invite/${invite.invite_token}`;
  }, [invite, origin]);

  async function handleGenerate() {
    if (!channelId) {
      toast.error("Chat channel is required before generating an invite");
      return;
    }

    const trimmedEmail = ownerExpectedEmail?.trim() || "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (trimmedEmail && !emailRegex.test(trimmedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setPendingAction("generate");
    try {
      await generateInvite({
        inquiry_id: inquiryId,
        channel_id: channelId,
        owner_expected_email: trimmedEmail.length > 0 ? trimmedEmail : undefined,
      });
      toast.success("Owner invite generated");
      setOwnerExpectedEmail("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate invite");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRegenerate() {
    if (!invite) {
      return;
    }

    setPendingAction("regenerate");
    try {
      await regenerateInvite({ invite_id: invite._id });
      toast.success("Owner invite regenerated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to regenerate invite");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCopyLink() {
    if (!inviteUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied");
    } catch {
      toast.error("Failed to copy invite link");
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm text-slate-500">
          You do not have permission to manage owner invites.
        </p>
      </div>
    );
  }

  if (invite === undefined) {
    return <p className="text-sm text-slate-500">Loading invite status...</p>;
  }

  if (!invite) {
    return (
      <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm text-slate-600">No invite generated yet.</p>
        <div className="space-y-2">
          <label
            htmlFor="owner-expected-email"
            className="text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Expected owner email (optional)
          </label>
          <Input
            id="owner-expected-email"
            type="email"
            placeholder="owner@example.com"
            value={ownerExpectedEmail}
            onChange={(event) => setOwnerExpectedEmail(event.target.value)}
          />
        </div>
        {!channelId && (
          <p className="text-xs text-slate-500">
            Open or create a deal room chat channel before generating an invite.
          </p>
        )}
        <Button
          type="button"
          size="sm"
          onClick={() => void handleGenerate()}
          disabled={pendingAction !== null || !channelId}
        >
          {pendingAction === "generate" ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Mail className="mr-2 size-4" />
          )}
          Generate Invite
        </Button>
      </div>
    );
  }

  const isPending = invite.status === OWNER_INVITE_STATUS.PENDING;
  const isExpired =
    invite.status === OWNER_INVITE_STATUS.EXPIRED ||
    (invite.status === OWNER_INVITE_STATUS.PENDING && invite.expires_at <= Date.now());
  const isConsumed = invite.status === OWNER_INVITE_STATUS.CONSUMED;
  const isRegenerated = invite.status === OWNER_INVITE_STATUS.REGENERATED;
  const canManageInvite =
    invite.status === OWNER_INVITE_STATUS.PENDING || invite.status === OWNER_INVITE_STATUS.EXPIRED;
  const consumedByLabel = invite.owner_expected_email ?? "owner account";

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={invite.status as OwnerInviteStatus} />
        <span className="text-xs text-slate-500">Created {formatDateTime(invite.created_at)}</span>
      </div>

      {invite.owner_expected_email && (
        <p className="text-sm text-slate-600">
          Expected email:{" "}
          <span className="font-medium text-slate-900">{invite.owner_expected_email}</span>
        </p>
      )}

      <div className="grid gap-1 text-sm text-slate-600">
        <p>
          Expires:{" "}
          <span className="font-medium text-slate-900">{formatDateTime(invite.expires_at)}</span>
        </p>
        {isPending && (
          <p>
            Time left:{" "}
            <span className={cn("font-medium", isExpired ? "text-rose-700" : "text-amber-700")}>
              {formatTimeRemaining(invite.expires_at)}
            </span>
          </p>
        )}
        {invite.consumed_at && (
          <p>
            Consumed:{" "}
            <span className="font-medium text-slate-900">{formatDateTime(invite.consumed_at)}</span>
          </p>
        )}
        {invite.consumed_by_user_id && (
          <p className="truncate">
            Consumed by user:{" "}
            <span className="font-mono text-xs text-slate-700">{invite.consumed_by_user_id}</span>
          </p>
        )}
      </div>

      {isConsumed && (
        <p className="text-sm text-slate-600">
          Consumed by <span className="font-medium text-slate-900">{consumedByLabel}</span>.
        </p>
      )}

      {isRegenerated && <p className="text-sm text-slate-600">Regenerated - new invite active.</p>}

      {canManageInvite && (
        <div className="space-y-2">
          <label
            htmlFor="owner-invite-link"
            className="text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Invite link
          </label>
          <div className="flex gap-2">
            <Input
              id="owner-invite-link"
              value={inviteUrl}
              readOnly
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Copy invite link"
              onClick={() => void handleCopyLink()}
              disabled={!inviteUrl}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {canManageInvite && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleRegenerate()}
          disabled={pendingAction !== null}
          className="gap-1.5"
        >
          {pendingAction === "regenerate" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCcw className="size-4" />
          )}
          Regenerate Invite
        </Button>
      )}
    </div>
  );
}
