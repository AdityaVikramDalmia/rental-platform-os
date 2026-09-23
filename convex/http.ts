import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { authKit } from "./auth";

const http = httpRouter();

authKit.registerRoutes(http);

const CORS_HEADERS = {
  "Content-Type": "application/json",
} as const;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function validateSecret(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return true;
  return request.headers.get("x-internal-secret") === secret;
}

function parseSupportPreferredContactMethod(
  value: unknown,
): "EMAIL" | "PHONE" | "WHATSAPP" | "IN_APP" | undefined {
  if (value === "EMAIL") return "EMAIL";
  if (value === "PHONE") return "PHONE";
  if (value === "WHATSAPP") return "WHATSAPP";
  if (value === "IN_APP") return "IN_APP";
  return undefined;
}

function parseSupportPersonaType(
  value: unknown,
): "TENANT" | "OWNER" | "GUARD" | "OTHER" | undefined {
  if (value === "TENANT") return "TENANT";
  if (value === "OWNER") return "OWNER";
  if (value === "GUARD") return "GUARD";
  if (value === "OTHER") return "OTHER";
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getNumberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function parseIpHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const candidate = value.split(",")[0]?.trim();
  if (!candidate || candidate.length > 64) {
    return null;
  }

  return candidate;
}

function getRequestIp(request: Request): string | undefined {
  const cfConnectingIp = parseIpHeaderValue(request.headers.get("cf-connecting-ip"));
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const xForwardedFor = parseIpHeaderValue(request.headers.get("x-forwarded-for"));
  if (xForwardedFor) {
    return xForwardedFor;
  }

  const xRealIp = parseIpHeaderValue(request.headers.get("x-real-ip"));
  if (xRealIp) {
    return xRealIp;
  }

  return undefined;
}

async function computeHmacSha256Hex(secret: string, rawBody: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return Array.from(new Uint8Array(signature), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

http.route({
  pathPrefix: "/api/listing/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const slug = url.pathname.replace("/api/listing/", "");

    if (!slug) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    const listing = await ctx.runQuery(api.listings.getBySlugPublic, {
      slug,
    });

    if (!listing) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    return new Response(JSON.stringify(listing), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  }),
});

http.route({
  path: "/api/public/support-inquiry",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!validateSecret(request)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    try {
      // Validate enum values — if provided, must be valid
      if (body.preferred_contact_method !== undefined && body.preferred_contact_method !== null) {
        const normalizedPreferredContactMethod = parseSupportPreferredContactMethod(
          body.preferred_contact_method,
        );
        if (normalizedPreferredContactMethod === undefined) {
          return jsonResponse(
            {
              error: "Invalid preferred_contact_method. Must be EMAIL, PHONE, WHATSAPP, or IN_APP.",
            },
            400,
          );
        }
      }

      if (body.persona_type !== undefined && body.persona_type !== null) {
        const normalizedPersonaType = parseSupportPersonaType(body.persona_type);
        if (normalizedPersonaType === undefined) {
          return jsonResponse(
            { error: "Invalid persona_type. Must be TENANT, OWNER, GUARD, or OTHER." },
            400,
          );
        }
      }

      const normalizedPreferredContactMethod = parseSupportPreferredContactMethod(
        body.preferred_contact_method,
      );
      const normalizedPersonaType = parseSupportPersonaType(body.persona_type);

      const id = await ctx.runMutation(internal.supportInquiries.submit, {
        name: String(body.name ?? ""),
        email: String(body.email ?? ""),
        phone: body.phone ? String(body.phone) : undefined,
        subject: String(body.subject ?? ""),
        message: String(body.message ?? ""),
        preferred_contact_method: normalizedPreferredContactMethod,
        persona_type: normalizedPersonaType,
        source_channel: body.source_channel ? String(body.source_channel) : undefined,
      });
      return jsonResponse({ id }, 200);
    } catch (error: unknown) {
      const data = (error as { data?: { kind?: string } }).data;
      if (data?.kind === "RateLimited") {
        return jsonResponse({ error: "Too many submissions. Please try again in 1 hour." }, 429);
      }
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("must be at least") ||
        message.includes("must be exactly") ||
        message.includes("Invalid email") ||
        message.includes("too long") ||
        message.includes("Invalid preferred") ||
        message.includes("Invalid persona") ||
        message.includes("Phone must be")
      ) {
        return jsonResponse({ error: message }, 400);
      }
      console.error("[http:support-inquiry]", message);
      return jsonResponse({ error: "Internal error" }, 500);
    }
  }),
});

http.route({
  path: "/api/public/newsletter-subscribe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!validateSecret(request)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    try {
      const email = String(body.email ?? "");
      const requestIp = getRequestIp(request);
      const id = await ctx.runMutation(internal.newsletterSubscriptions.subscribe, {
        email,
        source_page: body.source_page ? String(body.source_page) : undefined,
        ip: requestIp,
      });
      return jsonResponse({ id });
    } catch (error: unknown) {
      const data = (error as { data?: { kind?: string } }).data;
      if (data?.kind === "RateLimited") {
        return jsonResponse({ error: "Too many attempts. Please try again later." }, 429);
      }
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Invalid email")) {
        return jsonResponse({ error: message }, 400);
      }
      console.error("[http:newsletter-subscribe]", message);
      return jsonResponse({ error: "Internal error" }, 500);
    }
  }),
});

http.route({
  path: "/api/notifications/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.INTERNAL_API_SECRET;
    if (!webhookSecret) {
      return jsonResponse({ error: "Notification webhook secret not configured" }, 403);
    }

    if (!validateSecret(request)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const providerMessageId =
      typeof body.provider_message_id === "string" ? body.provider_message_id : "";
    const statusRaw = typeof body.status === "string" ? body.status.toUpperCase() : "";
    const status = statusRaw === "DELIVERED" || statusRaw === "FAILED" ? statusRaw : null;

    if (!providerMessageId || !status) {
      return jsonResponse({ error: "provider_message_id and status are required" }, 400);
    }

    await ctx.runMutation(internal.notifications.processDeliveryWebhook, {
      provider_message_id: providerMessageId,
      status,
      error: typeof body.error === "string" ? body.error : undefined,
    });

    return jsonResponse({ ok: true });
  }),
});

http.route({
  path: "/api/payments/razorpay/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error("[razorpay:webhook] Secret not configured");
      return jsonResponse({ error: "Not configured" }, 500);
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    if (!signature) {
      return jsonResponse({ error: "Missing signature" }, 400);
    }

    const expected = await computeHmacSha256Hex(secret, rawBody);

    if (expected !== signature) {
      console.error("[razorpay:webhook] Invalid signature");
      return jsonResponse({ error: "Invalid signature" }, 401);
    }

    let payloadUnknown: unknown;
    try {
      payloadUnknown = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const payload = asRecord(payloadUnknown);
    if (!payload) {
      return jsonResponse({ error: "Invalid payload" }, 400);
    }

    const event = getStringField(payload, "event");
    if (!event) {
      return jsonResponse({ error: "Missing event" }, 400);
    }

    try {
      const payloadEnvelope = asRecord(payload.payload);

      if (event === "payment.captured") {
        const paymentEntity = asRecord(asRecord(payloadEnvelope?.payment)?.entity);
        if (!paymentEntity) {
          return jsonResponse({ error: "Invalid payment payload" }, 400);
        }

        const paymentId = getStringField(paymentEntity, "id");
        const orderId = getStringField(paymentEntity, "order_id");
        const amountPaise = getNumberField(paymentEntity, "amount");

        if (!paymentId || !orderId || amountPaise === null) {
          return jsonResponse({ error: "Missing payment.captured fields" }, 400);
        }

        await ctx.runMutation(internal.monetization.handlePaymentCaptured, {
          payment_id: paymentId,
          order_id: orderId,
          amount_paise: amountPaise,
          raw_event: payload,
        });
      } else if (event === "payment.failed") {
        const paymentEntity = asRecord(asRecord(payloadEnvelope?.payment)?.entity);
        if (!paymentEntity) {
          return jsonResponse({ error: "Invalid payment payload" }, 400);
        }

        const paymentId = getStringField(paymentEntity, "id");
        const orderId = getStringField(paymentEntity, "order_id");

        if (!paymentId || !orderId) {
          return jsonResponse({ error: "Missing payment.failed fields" }, 400);
        }

        await ctx.runMutation(internal.monetization.handlePaymentFailed, {
          payment_id: paymentId,
          order_id: orderId,
          raw_event: payload,
        });
      } else if (event === "refund.processed") {
        const refundEntity = asRecord(asRecord(payloadEnvelope?.refund)?.entity);
        if (!refundEntity) {
          return jsonResponse({ error: "Invalid refund payload" }, 400);
        }

        const refundId = getStringField(refundEntity, "id");
        const paymentId = getStringField(refundEntity, "payment_id");
        const amountPaise = getNumberField(refundEntity, "amount");

        if (!refundId || !paymentId || amountPaise === null) {
          return jsonResponse({ error: "Missing refund.processed fields" }, 400);
        }

        await ctx.runMutation(internal.monetization.handleRefundProcessed, {
          refund_id: refundId,
          payment_id: paymentId,
          amount_paise: amountPaise,
          raw_event: payload,
        });
      }

      return jsonResponse({ status: "ok" }, 200);
    } catch (error) {
      console.error("[razorpay:webhook] Error:", error);
      return jsonResponse({ error: "Error" }, 500);
    }
  }),
});

export default http;
