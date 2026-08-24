"use server";

import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export async function submitContactFormAction(formData: {
  listing_id: string;
  name: string;
  phone: string;
  message?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await fetchMutation(api.listings.submitInquiry, {
      listing_id: formData.listing_id as Id<"listings">,
      name: formData.name,
      phone: formData.phone,
      message: formData.message,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong";

    if (message.toLowerCase().includes("rate")) {
      return { success: false, error: "Too many inquiries. Try again in 1 hour." };
    }

    return { success: false, error: message };
  }
}

export async function trackWhatsAppClickAction(
  listingId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await fetchMutation(api.listings.trackWhatsAppClick, {
      listing_id: listingId as Id<"listings">,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong";

    if (message.toLowerCase().includes("rate")) {
      return { success: false, error: "Too many clicks. Try again in 1 hour." };
    }

    return { success: false, error: message };
  }
}
