"use client";

import { AlertCircle, Check, Clock, ShieldAlert } from "lucide-react";
import {
  CHAT_MESSAGE_STATUS,
  CHAT_SENDER_ROLE,
  CHAT_SENDER_ROLE_LABELS,
  type ChatMessageStatus,
  type ChatSenderRole,
} from "../../../lib/constants";
import { formatRelativeTime } from "../../../lib/dates";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChecklistCard } from "../deal-room/ChecklistCard";
import { NegotiationProposalMessage } from "./NegotiationProposalMessage";
import { SenderPreview } from "./SenderPreview";

export type ChatMessage = {
  _id: string;
  channel_id: string;
  sender_user_id: string;
  sender_role: ChatSenderRole;
  original_content: string;
  masked_content?: string;
  status: ChatMessageStatus;
  failure_reason?: string;
  admin_review_required: boolean;
  is_ai_processed: boolean;
  created_at: number;
};

type MessageBubbleProps = {
  message: ChatMessage;
  isOwnMessage: boolean;
  currentUserRole?: string;
  showOriginal?: boolean;
};

function StatusIndicator({ status }: { status: ChatMessageStatus }) {
  if (
    status === CHAT_MESSAGE_STATUS.SUBMITTED ||
    status === CHAT_MESSAGE_STATUS.BATCHED ||
    status === CHAT_MESSAGE_STATUS.PROCESSING
  ) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
        <Clock className="size-3" />
        Sending…
      </span>
    );
  }

  if (status === CHAT_MESSAGE_STATUS.DELIVERED) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500">
        <Check className="size-3" />
      </span>
    );
  }

  if (status === CHAT_MESSAGE_STATUS.FAILED) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-red-500">
        <AlertCircle className="size-3" />
        Failed
      </span>
    );
  }

  return null;
}

const CHECKLIST_PREFIX = "CHECKLIST_SHARED:";
const PROPOSAL_PREFIX = "NEGOTIATION_PROPOSAL_SHARED:";

function extractChecklistId(content: string): Id<"deal_checklists"> | null {
  if (content.startsWith(CHECKLIST_PREFIX)) {
    const rawId = content.slice(CHECKLIST_PREFIX.length).trim();
    if (rawId.length > 0) {
      return rawId as Id<"deal_checklists">;
    }
  }
  return null;
}

function extractNegotiationProposalIds(content: string): {
  negotiationId: Id<"negotiations">;
  proposalId: Id<"negotiation_terms_proposals">;
} | null {
  if (!content.startsWith(PROPOSAL_PREFIX)) {
    return null;
  }

  const parts = content.slice(PROPOSAL_PREFIX.length).trim().split(":");
  if (parts.length !== 2) {
    return null;
  }

  const [negotiationIdRaw, proposalIdRaw] = parts;
  if (!negotiationIdRaw || !proposalIdRaw) {
    return null;
  }

  return {
    negotiationId: negotiationIdRaw as Id<"negotiations">,
    proposalId: proposalIdRaw as Id<"negotiation_terms_proposals">,
  };
}

export function MessageBubble({
  message,
  isOwnMessage,
  currentUserRole,
  showOriginal = false,
}: MessageBubbleProps) {
  if (message.sender_role === CHAT_SENDER_ROLE.SYSTEM) {
    const checklistId = extractChecklistId(message.original_content);
    if (checklistId) {
      return (
        <div className="flex w-full justify-center py-2">
          <ChecklistCard checklistId={checklistId} />
        </div>
      );
    }

    const proposalIds = extractNegotiationProposalIds(message.original_content);
    if (proposalIds) {
      return (
        <div className="flex w-full justify-center py-2">
          <NegotiationProposalMessage
            proposalId={proposalIds.proposalId}
            negotiationId={proposalIds.negotiationId}
            currentUserRole={currentUserRole}
            className="w-full max-w-2xl"
          />
        </div>
      );
    }
  }

  const displayContent = isOwnMessage
    ? message.original_content
    : message.status === CHAT_MESSAGE_STATUS.DELIVERED
      ? (message.masked_content ?? "Message processing...")
      : message.status === CHAT_MESSAGE_STATUS.FAILED
        ? "Message unavailable"
        : "Message processing...";

  const hasMaskedVersion =
    isOwnMessage && message.masked_content && message.masked_content !== message.original_content;

  const isFailed = message.status === CHAT_MESSAGE_STATUS.FAILED;

  return (
    <div className={cn("flex w-full", isOwnMessage ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] space-y-1 sm:max-w-[70%]",
          isOwnMessage ? "items-end" : "items-start",
        )}
      >
        <p
          className={cn(
            "text-[11px] font-medium uppercase tracking-wide",
            isOwnMessage ? "text-right text-indigo-400" : "text-left text-slate-400",
          )}
        >
          {isOwnMessage
            ? "You"
            : (CHAT_SENDER_ROLE_LABELS[message.sender_role] ?? message.sender_role)}
        </p>

        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
            isOwnMessage
              ? "rounded-br-md bg-indigo-600 text-white"
              : isFailed
                ? "rounded-bl-md bg-red-50 text-red-700"
                : "rounded-bl-md bg-slate-100 text-slate-900",
          )}
        >
          <p className={cn("whitespace-pre-wrap break-words", isFailed && "italic opacity-75")}>
            {displayContent}
          </p>
        </div>

        {showOriginal && hasMaskedVersion && (
          <SenderPreview
            originalContent={message.original_content}
            maskedContent={message.masked_content}
          />
        )}

        <div
          className={cn("flex items-center gap-2", isOwnMessage ? "justify-end" : "justify-start")}
        >
          <span className="text-[11px] text-slate-400">
            {formatRelativeTime(message.created_at)}
          </span>
          {isOwnMessage && <StatusIndicator status={message.status} />}
        </div>

        {message.status === CHAT_MESSAGE_STATUS.FAILED && message.admin_review_required && (
          <Badge variant="outline" className="mt-1 border-orange-300 bg-orange-50 text-orange-700">
            <ShieldAlert className="mr-1 size-3" />
            Pending Review
          </Badge>
        )}

        {message.status === CHAT_MESSAGE_STATUS.FAILED && message.failure_reason && (
          <p className="mt-0.5 text-[11px] text-red-400">{message.failure_reason}</p>
        )}
      </div>
    </div>
  );
}
