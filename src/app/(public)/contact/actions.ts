"use server";

import { headers } from "next/headers";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "";

function extractClientIp(headersList: Headers): string {
  return (
    headersList.get("x-real-ip")?.trim() ||
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function callConvexEndpoint(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: { error?: string; id?: string } }> {
  const response = await fetch(`${CONVEX_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(INTERNAL_SECRET && { "x-internal-secret": INTERNAL_SECRET }),
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as { error?: string; id?: string };
  return { ok: response.ok, status: response.status, data };
}

export async function submitSupportInquiryAction(formData: {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  preferred_contact_method?: string;
  persona_type?: string;
}): Promise<{ success: boolean; error?: string }> {
  const result = await callConvexEndpoint("/api/public/support-inquiry", {
    ...formData,
    source_channel: "contact_page",
  });

  if (result.ok) return { success: true };

  if (result.status === 429) {
    return {
      success: false,
      error: result.data.error ?? "Too many submissions. Please try again later.",
    };
  }
  if (result.status === 400) {
    return { success: false, error: result.data.error ?? "Please check your input and try again." };
  }
  return { success: false, error: "Unable to submit right now. Please try again later." };
}

export async function subscribeNewsletterAction(formData: {
  email: string;
  source_page: string;
}): Promise<{ success: boolean; error?: string }> {
  const headersList = await headers();
  const ip = extractClientIp(headersList);

  const result = await callConvexEndpoint("/api/public/newsletter-subscribe", {
    ...formData,
    ip,
  });

  if (result.ok) return { success: true };

  if (result.status === 429) {
    return {
      success: false,
      error: result.data.error ?? "Too many attempts. Please try again later.",
    };
  }
  if (result.status === 400) {
    return { success: false, error: result.data.error ?? "Please check your email and try again." };
  }
  return { success: false, error: "Unable to subscribe right now. Please try again later." };
}
