"use client";

import { useAction, useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

type VoiceState = "idle" | "recording" | "uploading" | "transcribing" | "retrying" | "error";

interface UseVoiceTranscriptionOptions {
  language?: string;
  entityType?: string;
  entityId?: string;
  onTranscript: (text: string) => void;
}

interface UseVoiceTranscriptionReturn {
  state: VoiceState;
  retryCount: number;
  isSupported: boolean;
  recorderError: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  dismiss: () => void;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;
const MAX_RECORDING_MS = 120_000;

function mapLocaleToWhisperLanguage(language?: string): string {
  if (!language) {
    return "en";
  }

  if (language === "hinglish") {
    return "hi";
  }

  if (language === "en" || language === "hi") {
    return language;
  }

  return language;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function useVoiceTranscription({
  language,
  entityType,
  entityId,
  onTranscript,
}: UseVoiceTranscriptionOptions): UseVoiceTranscriptionReturn {
  const [state, setState] = useState<VoiceState>("idle");
  const [retryCount, setRetryCount] = useState(0);

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const { startRecording, stopRecording, isSupported, error: recorderError } = useAudioRecorder();
  const generateAudioUploadUrl = useMutation(api.voiceTranscriptions.generateAudioUploadUrl);
  const transcribeAction = useAction(api.voiceTranscriptions.transcribe);
  const isMountedRef = useRef(true);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStoppingRef = useRef(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
    };
  }, []);

  const whisperLanguage = useMemo(() => mapLocaleToWhisperLanguage(language), [language]);

  const dismiss = useCallback(() => {
    setState("idle");
    setRetryCount(0);
  }, []);

  const uploadAndTranscribe = useCallback(
    async (blob: Blob, durationMs: number, attempt: number): Promise<void> => {
      try {
        if (!isMountedRef.current) {
          return;
        }
        setState("uploading");

        const uploadUrl = await generateAudioUploadUrl({});
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": blob.type || "audio/webm",
          },
          body: blob,
        });

        if (!uploadResponse.ok) {
          throw new Error("Audio upload failed");
        }

        const uploadResult = (await uploadResponse.json()) as {
          storageId?: Id<"_storage">;
        };

        if (!uploadResult.storageId) {
          throw new Error("Missing storageId from upload response");
        }

        if (!isMountedRef.current) {
          return;
        }
        setState("transcribing");
        const result = await transcribeAction({
          storageId: uploadResult.storageId,
          language: whisperLanguage,
          entity_type: entityType ?? "unknown",
          entity_id: entityId ?? "unknown",
          duration_ms: durationMs,
        });

        const transcript = result.transcript.trim();
        if (transcript.length > 0) {
          onTranscriptRef.current(transcript);
        }

        if (!isMountedRef.current) {
          return;
        }
        setRetryCount(0);
        setState("idle");
      } catch {
        const nextAttempt = attempt + 1;
        if (!isMountedRef.current) {
          return;
        }
        if (nextAttempt > MAX_RETRIES) {
          setState("error");
          return;
        }

        setRetryCount(nextAttempt);
        setState("retrying");
        await wait(RETRY_DELAYS_MS[Math.min(nextAttempt - 1, RETRY_DELAYS_MS.length - 1)]);
        if (!isMountedRef.current) {
          return;
        }
        await uploadAndTranscribe(blob, durationMs, nextAttempt);
      }
    },
    [entityId, entityType, generateAudioUploadUrl, transcribeAction, whisperLanguage],
  );

  const startRecordingFlow = useCallback(async () => {
    if (state !== "idle" && state !== "error") {
      return;
    }

    if (!isSupported) {
      setState("idle");
      return;
    }

    if (state === "error") {
      dismiss();
    }

    setRetryCount(0);
    setState("recording");

    const result = await startRecording();
    if (!result.success) {
      setState("idle");
      return;
    }

    autoStopTimerRef.current = setTimeout(() => {
      autoStopTimerRef.current = null;
      void stopFlowRef.current();
    }, MAX_RECORDING_MS);
  }, [dismiss, isSupported, startRecording, state]);

  const stopRecordingFlow = useCallback(async () => {
    if (state !== "recording" || isStoppingRef.current) {
      return;
    }

    isStoppingRef.current = true;

    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

    try {
      const { blob, durationMs } = await stopRecording();
      if (!blob) {
        setState("idle");
        return;
      }

      await uploadAndTranscribe(blob, durationMs, 0);
    } finally {
      isStoppingRef.current = false;
    }
  }, [state, stopRecording, uploadAndTranscribe]);

  const stopFlowRef = useRef(stopRecordingFlow);
  stopFlowRef.current = stopRecordingFlow;

  return {
    state,
    retryCount,
    isSupported,
    recorderError,
    startRecording: () => {
      void startRecordingFlow();
    },
    stopRecording: () => {
      void stopRecordingFlow();
    },
    dismiss,
  };
}
