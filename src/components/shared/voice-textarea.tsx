"use client";

import * as React from "react";
import { AlertCircle, Check, Loader2, Mic, MicOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useVoiceTranscription } from "@/hooks/useVoiceTranscription";
import { cn } from "@/lib/utils";

interface VoiceTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  language?: string;
  entityType?: string;
  entityId?: string;
  onValueChange?: (value: string) => void;
}

export const VoiceTextarea = React.forwardRef<HTMLTextAreaElement, VoiceTextareaProps>(
  ({ language, entityType, entityId, onValueChange, className, value, ...props }, forwardedRef) => {
    const t = useTranslations("guard.voice");
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const successTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const errorToastShownRef = React.useRef(false);
    const [showSuccess, setShowSuccess] = React.useState(false);

    const handleTranscript = React.useCallback(
      (text: string) => {
        const currentValue = textareaRef.current?.value ?? (typeof value === "string" ? value : "");
        const newValue = currentValue ? `${currentValue} ${text}` : text;

        if (textareaRef.current) {
          textareaRef.current.value = newValue;

          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            "value",
          )?.set;
          nativeInputValueSetter?.call(textareaRef.current, newValue);
          textareaRef.current.dispatchEvent(new Event("input", { bubbles: true }));
        }

        onValueChange?.(newValue);
      },
      [onValueChange, value],
    );

    const {
      state,
      retryCount,
      isSupported: voiceSupported,
      recorderError,
      startRecording,
      stopRecording,
      dismiss,
    } = useVoiceTranscription({
      language,
      entityType,
      entityId,
      onTranscript: (text) => {
        handleTranscript(text);
        setShowSuccess(true);

        if (successTimerRef.current) {
          clearTimeout(successTimerRef.current);
        }
        successTimerRef.current = setTimeout(() => {
          setShowSuccess(false);
          successTimerRef.current = null;
        }, 1000);
      },
    });

    const isSupported = voiceSupported;

    React.useEffect(() => {
      if (recorderError === "permission_denied") {
        toast.error(t("permissionDenied"));
      }
    }, [recorderError, t]);

    React.useEffect(() => {
      if (state === "error" && !errorToastShownRef.current) {
        errorToastShownRef.current = true;
        toast.error(t("error"));
      }

      if (state !== "error") {
        errorToastShownRef.current = false;
      }
    }, [state, t]);

    React.useEffect(() => {
      return () => {
        if (successTimerRef.current) {
          clearTimeout(successTimerRef.current);
          successTimerRef.current = null;
        }
      };
    }, []);

    const isProcessing = state === "uploading" || state === "transcribing" || state === "retrying";
    const isVoiceDisabled = isProcessing || !!props.disabled;

    const handleVoiceClick = () => {
      if (isVoiceDisabled) {
        return;
      }

      if (state === "recording") {
        stopRecording();
        return;
      }

      if (state === "error") {
        dismiss();
      }

      startRecording();
    };

    const icon = showSuccess ? (
      <Check className="size-4 text-green-600" />
    ) : state === "recording" ? (
      <MicOff className="size-4 text-red-600" />
    ) : state === "uploading" || state === "transcribing" ? (
      <Loader2 className="size-4 animate-spin text-blue-600" />
    ) : state === "retrying" ? (
      <Loader2 className="size-4 animate-spin text-amber-600" />
    ) : state === "error" ? (
      <AlertCircle className="size-4 text-red-600" />
    ) : (
      <Mic className="size-4 text-slate-500" />
    );

    const statusLabel = showSuccess
      ? null
      : state === "recording"
        ? t("recording")
        : state === "uploading"
          ? t("uploading")
          : state === "transcribing"
            ? t("transcribing")
            : state === "retrying"
              ? t("retrying", { count: retryCount, max: 3 })
              : state === "error"
                ? t("error")
                : null;

    return (
      <div className="space-y-2">
        <Textarea
          {...props}
          value={value}
          className={className}
          ref={(node) => {
            textareaRef.current = node;

            if (typeof forwardedRef === "function") {
              forwardedRef(node);
              return;
            }

            if (forwardedRef) {
              forwardedRef.current = node;
            }
          }}
        />

        {isSupported ? (
          <div className="flex items-center gap-2" aria-live="polite">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleVoiceClick}
              disabled={isVoiceDisabled}
              aria-label={state === "recording" ? t("stopRecording") : t("startRecording")}
              aria-pressed={state === "recording"}
              className={cn(
                "h-8 w-8 rounded-full",
                state === "recording" && "animate-pulse ring-2 ring-red-300",
              )}
            >
              {icon}
            </Button>

            <span
              className={cn(
                "text-xs",
                state === "recording" && "text-red-600",
                (state === "uploading" || state === "transcribing") && "text-blue-600",
                state === "retrying" && "text-amber-600",
                state === "error" && "text-red-600",
                !statusLabel && "text-muted-foreground",
              )}
            >
              {statusLabel}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

VoiceTextarea.displayName = "VoiceTextarea";
