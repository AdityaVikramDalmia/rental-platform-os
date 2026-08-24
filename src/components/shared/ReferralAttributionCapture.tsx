"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../../convex/_generated/api";
import { USER_TYPE } from "../../../lib/constants";

const REFERRAL_ATTRIBUTION_KEY = "referral_attribution";
const REFERRAL_COOKIE_NAME = "ref_code";

function readReferralCodeFromCookie(): string | null {
  const rawCookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${REFERRAL_COOKIE_NAME}=`));

  if (!rawCookie) {
    return null;
  }

  const value = decodeURIComponent(rawCookie.split("=")[1] ?? "")
    .trim()
    .toUpperCase();
  return value || null;
}

function readReferralCodeFromStorage(): string | null {
  const rawPayload = window.localStorage.getItem(REFERRAL_ATTRIBUTION_KEY);

  if (!rawPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawPayload) as { code?: unknown };

    if (typeof parsed.code !== "string") {
      return null;
    }

    const normalizedCode = parsed.code.trim().toUpperCase();
    return normalizedCode || null;
  } catch {
    return null;
  }
}

function clearStoredReferralData() {
  window.localStorage.removeItem(REFERRAL_ATTRIBUTION_KEY);
  document.cookie = `${REFERRAL_COOKIE_NAME}=; max-age=0; path=/`;
}

export function ReferralAttributionCapture() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const captureReferralFromCode = useMutation(api.referrals.captureReferralFromCode);
  const attemptedCodeRef = useRef<string | null>(null);
  const inFlightCodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    if (
      !(
        currentUser.user_types?.some((t) => t === USER_TYPE.TENANT || t === USER_TYPE.OWNER) ??
        (currentUser.user_type === USER_TYPE.TENANT || currentUser.user_type === USER_TYPE.OWNER)
      )
    ) {
      return;
    }

    const code = readReferralCodeFromStorage() ?? readReferralCodeFromCookie();

    if (!code) {
      return;
    }

    const dedupeKey = `${currentUser._id}:${code}`;

    if (attemptedCodeRef.current === dedupeKey || inFlightCodeRef.current === dedupeKey) {
      return;
    }

    inFlightCodeRef.current = dedupeKey;

    void (async () => {
      try {
        const result = await captureReferralFromCode({ referral_code: code });
        const reason = String(result.reason);

        if (reason === "rate_limited") {
          return;
        }

        attemptedCodeRef.current = dedupeKey;
        clearStoredReferralData();
      } catch {
        return;
      } finally {
        if (inFlightCodeRef.current === dedupeKey) {
          inFlightCodeRef.current = null;
        }
      }
    })();
  }, [captureReferralFromCode, currentUser]);

  return null;
}
