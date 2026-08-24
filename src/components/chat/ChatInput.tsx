"use client";

import { useMutation } from "convex/react";
import { Loader2, Send } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CHAT_CHANNEL_STATUS, type ChatChannelStatus } from "../../../lib/constants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChatInputProps = {
  channelId: Id<"chat_channels">;
  channelStatus: ChatChannelStatus;
  maxLength?: number;
};

const DEFAULT_MAX_LENGTH = 2000;

export function ChatInput({
  channelId,
  channelStatus,
  maxLength = DEFAULT_MAX_LENGTH,
}: ChatInputProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useMutation(api.chatMessages.send);

  const isArchived = channelStatus === CHAT_CHANNEL_STATUS.ARCHIVED;
  const trimmedLength = draft.trim().length;
  const isOverLimit = trimmedLength > maxLength;
  const canSend = trimmedLength > 0 && !isOverLimit && !isSending && !isArchived;

  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content || content.length > maxLength || isSending || isArchived) return;

    setIsSending(true);
    try {
      await sendMessage({ channel_id: channelId, content });
      setDraft("");
      textareaRef.current?.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send message";
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  }, [draft, maxLength, isSending, isArchived, sendMessage, channelId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (canSend) {
          handleSend();
        }
      }
    },
    [canSend, handleSend],
  );

  if (isArchived) {
    return (
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-center text-sm text-slate-500">
          This chat is archived. No new messages can be sent.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-200 bg-white px-4 py-3">
      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            disabled={isSending}
            rows={1}
            className={cn(
              "min-h-[44px] max-h-[120px] resize-none pr-16 text-sm",
              isOverLimit && "border-red-300 focus-visible:ring-red-300",
            )}
          />
          <span
            className={cn(
              "absolute bottom-2 right-3 text-[11px] tabular-nums",
              isOverLimit ? "font-semibold text-red-500" : "text-slate-400",
            )}
          >
            {trimmedLength}/{maxLength}
          </span>
        </div>

        <Button
          type="button"
          size="icon"
          onClick={handleSend}
          disabled={!canSend}
          className="size-[44px] shrink-0 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {isSending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
        </Button>
      </div>
    </div>
  );
}
