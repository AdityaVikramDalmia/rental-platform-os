"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import { USER_TYPE } from "../../../../../lib/constants";

const REFERRAL_ATTRIBUTION_KEY = "referral_attribution";
const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const REFERRAL_CODE_PATTERN = /^FLAT-[A-Z0-9]{5}$/;

function getCodeFromParams(code: string | string[] | undefined): string {
  const value = Array.isArray(code) ? code[0] : code;

  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toUpperCase();
}

export default function ReferralLandingPage() {
  const router = useRouter();
  const params = useParams<{ code?: string | string[] }>();
  const referralCode = getCodeFromParams(params.code);
  const isValidCodeFormat = REFERRAL_CODE_PATTERN.test(referralCode);
  const referralCodeLookup = useQuery(
    api.referralCodes.getByCode,
    isValidCodeFormat ? { code: referralCode } : "skip",
  );

  useEffect(() => {
    if (!referralCode) {
      router.push("/listings");
      return;
    }

    if (isValidCodeFormat && referralCodeLookup === undefined) {
      return;
    }

    const ownerType = referralCodeLookup?.referrer.owner_type;
    const hasValidOwnerType = ownerType === USER_TYPE.TENANT || ownerType === USER_TYPE.OWNER;
    const shouldPersistAttribution = isValidCodeFormat && hasValidOwnerType;

    try {
      if (!shouldPersistAttribution) {
        return;
      }

      const payload = {
        code: referralCode,
        timestamp: Date.now(),
        landing_page: window.location.href,
      };

      window.localStorage.setItem(REFERRAL_ATTRIBUTION_KEY, JSON.stringify(payload));
      document.cookie = `ref_code=${encodeURIComponent(referralCode)}; max-age=${REFERRAL_COOKIE_MAX_AGE_SECONDS}; path=/`;
    } finally {
      router.push("/listings");
    }
  }, [isValidCodeFormat, referralCode, referralCodeLookup, router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 text-center text-sm text-slate-600">
      Redirecting to listings...
    </div>
  );
}
