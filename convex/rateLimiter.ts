import { RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  "guard:lead_submission": {
    kind: "fixed window",
    period: 60 * 1000,
    rate: 3,
  },
  "public:listing_inquiry": {
    kind: "fixed window",
    period: 60 * 60 * 1000, // 1 HOUR
    rate: 5,
  },
  "public:referral_signup": {
    kind: "fixed window",
    period: 60 * 60 * 1000, // 1 hour
    rate: 10,
  },
  "tenant:inquiry_submission": {
    kind: "fixed window",
    rate: 5,
    period: 60 * 60 * 1000,
  },
  "chat:send_message": {
    kind: "fixed window",
    rate: 20,
    period: 60 * 1000,
  },
  "negotiation:propose_terms": {
    kind: "fixed window",
    rate: 5,
    period: 60 * 60 * 1000, // 1 hour
  },
  "negotiation:sign_terms": {
    kind: "fixed window",
    rate: 10,
    period: 60 * 60 * 1000, // 1 hour
  },
  "negotiation:dismiss_flag": {
    kind: "token bucket",
    rate: 10,
    period: 60 * 1000,
    capacity: 10,
  },
  "negotiation:initiate": {
    kind: "token bucket",
    rate: 5,
    period: 60000,
    capacity: 5,
  },
  "persona:switch": {
    kind: "token bucket",
    rate: 10,
    period: 60000,
    capacity: 10,
  },
  "persona:modify": {
    kind: "token bucket",
    rate: 5,
    period: 60000,
    capacity: 5,
  },
  "checklist:create": {
    kind: "token bucket",
    rate: 10,
    period: 60000,
    capacity: 10,
  },
  "role:modify": {
    kind: "token bucket",
    rate: 10,
    period: 60000,
    capacity: 10,
  },
  "chat:mark_read": {
    kind: "fixed window",
    rate: 30,
    period: 60 * 1000,
  },
  "voice:upload_url": {
    kind: "fixed window",
    rate: 20,
    period: 60 * 1000,
  },
  "voice:transcribe": {
    kind: "fixed window",
    rate: 10,
    period: 60 * 1000,
  },
  "guard:upload_url_generation": {
    kind: "fixed window",
    rate: 20,
    period: 60 * 1000,
  },
  "checklist:upload_url_generation": {
    kind: "fixed window",
    rate: 20,
    period: 60 * 1000,
  },
  "documents:upload_url_generation": {
    kind: "fixed window",
    rate: 20,
    period: 60 * 1000,
  },
  consume_invite: {
    kind: "fixed window",
    rate: 5,
    period: 60 * 1000,
  },
  "public:owner_service_request": {
    kind: "fixed window",
    period: 60 * 60 * 1000,
    rate: 3,
  },
  "public:whatsapp_click": {
    kind: "fixed window",
    period: 60 * 60 * 1000, // 1 HOUR
    rate: 10,
  },
  "public:support_inquiry": {
    kind: "fixed window",
    period: 60 * 60 * 1000, // 1 HOUR
    rate: 5,
  },
  "public:newsletter_subscribe": {
    kind: "fixed window",
    period: 60 * 60 * 1000, // 1 HOUR
    rate: 10,
  },
});
