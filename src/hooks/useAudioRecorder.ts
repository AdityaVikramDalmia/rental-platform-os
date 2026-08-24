"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseAudioRecorderReturn {
  isRecording: boolean;
  isSupported: boolean;
  startRecording: () => Promise<{ success: boolean; error?: string }>;
  stopRecording: () => Promise<{ blob: Blob | null; durationMs: number }>;
  duration: number;
  error: string | null;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPromiseRef = useRef<Promise<{ blob: Blob | null; durationMs: number }> | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStreamTracks = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }, []);

  const finalizeRecording = useCallback((): { blob: Blob | null; durationMs: number } => {
    const recorder = mediaRecorderRef.current;
    const mimeType = recorder?.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const nextDuration = startTimeRef.current > 0 ? Date.now() - startTimeRef.current : 0;

    clearTimer();
    stopStreamTracks();
    chunksRef.current = [];
    mediaRecorderRef.current = null;
    stopPromiseRef.current = null;
    startTimeRef.current = 0;
    setDuration(nextDuration);
    setIsRecording(false);

    if (blob.size === 0) {
      return { blob: null, durationMs: nextDuration };
    }

    return { blob, durationMs: nextDuration };
  }, [clearTimer, stopStreamTracks]);

  const stopRecording = useCallback(async (): Promise<{
    blob: Blob | null;
    durationMs: number;
  }> => {
    clearTimer();

    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      setIsRecording(false);
      stopStreamTracks();
      return { blob: null, durationMs: 0 };
    }

    if (stopPromiseRef.current) {
      return await stopPromiseRef.current;
    }

    stopPromiseRef.current = new Promise<{ blob: Blob | null; durationMs: number }>((resolve) => {
      const handleStop = () => {
        resolve(finalizeRecording());
      };

      const handleError = () => {
        setError("Failed to record audio");
        resolve(finalizeRecording());
      };

      recorder.onstop = handleStop;
      recorder.onerror = handleError;

      if (recorder.state === "inactive") {
        handleStop();
        return;
      }

      recorder.stop();
    });

    return await stopPromiseRef.current;
  }, [clearTimer, finalizeRecording, stopStreamTracks]);

  const startRecording = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setError(null);

    const unsupportedMessage = "MediaRecorder is not supported in this browser";
    if (
      typeof window === "undefined" ||
      !("MediaRecorder" in window) ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(unsupportedMessage);
      return { success: false, error: unsupportedMessage };
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      return { success: true };
    }

    if (stopPromiseRef.current) {
      await stopPromiseRef.current;
    }

    clearTimer();
    stopStreamTracks();
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredMimeType = "audio/webm;codecs=opus";
      const fallbackMimeType = "audio/webm";

      const recorder = MediaRecorder.isTypeSupported(preferredMimeType)
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : MediaRecorder.isTypeSupported(fallbackMimeType)
          ? new MediaRecorder(stream, { mimeType: fallbackMimeType })
          : new MediaRecorder(stream);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setError("Failed to record audio");
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      startTimeRef.current = Date.now();
      setDuration(0);
      setIsRecording(true);

      return { success: true };
    } catch (err: unknown) {
      stopStreamTracks();
      setIsRecording(false);
      startTimeRef.current = 0;

      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("permission_denied");
        return { success: false, error: "permission_denied" };
      }

      const message = err instanceof Error ? err.message : "Unable to start recording";
      setError(message);
      return { success: false, error: message };
    }
  }, [clearTimer, stopStreamTracks]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Feature detection depends on `window`/`navigator`, which are unavailable during SSR;
    // sync it post-mount so the server-rendered markup matches the client's first hydration pass.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSupported(
      "MediaRecorder" in window &&
        typeof navigator !== "undefined" &&
        typeof navigator.mediaDevices?.getUserMedia === "function",
    );
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        recorder.stop();
      }

      stopStreamTracks();
      mediaRecorderRef.current = null;
      stopPromiseRef.current = null;
      chunksRef.current = [];
      startTimeRef.current = 0;
    };
  }, [clearTimer, stopStreamTracks]);

  return {
    isRecording,
    isSupported,
    startRecording,
    stopRecording,
    duration,
    error,
  };
}
