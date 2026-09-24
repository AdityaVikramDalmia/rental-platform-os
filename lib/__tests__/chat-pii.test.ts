import { describe, expect, it } from "vitest";
import {
  postCheckForPII,
  preMaskPII,
  preScanForPII,
  validateBatchTransition,
  validateChannelTransition,
  validateMessageTransition,
} from "../chat";

function mask(text: string): string {
  return preMaskPII(text, preScanForPII(text));
}

describe("lib/chat", () => {
  describe("validateChannelTransition", () => {
    it("only toggles a channel between ACTIVE and ARCHIVED", () => {
      expect(validateChannelTransition("ACTIVE", "ARCHIVED")).toBe(true);
      expect(validateChannelTransition("ARCHIVED", "ACTIVE")).toBe(true);
      expect(validateChannelTransition("ACTIVE", "ACTIVE")).toBe(false);
      expect(validateChannelTransition("ARCHIVED", "ARCHIVED")).toBe(false);
    });
  });

  describe("validateMessageTransition", () => {
    it("walks SUBMITTED → BATCHED → PROCESSING and never skips a stage", () => {
      expect(validateMessageTransition("SUBMITTED", "BATCHED")).toBe(true);
      expect(validateMessageTransition("BATCHED", "PROCESSING")).toBe(true);
      expect(validateMessageTransition("SUBMITTED", "PROCESSING")).toBe(false);
      expect(validateMessageTransition("SUBMITTED", "DELIVERED")).toBe(false);
      expect(validateMessageTransition("BATCHED", "DELIVERED")).toBe(false);
    });

    it("lets a FAILED message be delivered by moderation but keeps DELIVERED terminal", () => {
      expect(validateMessageTransition("PROCESSING", "DELIVERED")).toBe(true);
      expect(validateMessageTransition("PROCESSING", "FAILED")).toBe(true);
      expect(validateMessageTransition("FAILED", "DELIVERED")).toBe(true);
      expect(validateMessageTransition("FAILED", "PROCESSING")).toBe(false);
      for (const next of ["SUBMITTED", "BATCHED", "PROCESSING", "FAILED"] as const) {
        expect(validateMessageTransition("DELIVERED", next)).toBe(false);
      }
    });
  });

  describe("validateBatchTransition", () => {
    it("only starts processing from COLLECTING and never reopens a delivered batch", () => {
      expect(validateBatchTransition("COLLECTING", "PROCESSING")).toBe(true);
      expect(validateBatchTransition("COLLECTING", "DELIVERED")).toBe(false);
      expect(validateBatchTransition("PROCESSING", "FAILED")).toBe(true);
      expect(validateBatchTransition("FAILED", "DELIVERED")).toBe(true);
      expect(validateBatchTransition("DELIVERED", "FAILED")).toBe(false);
      expect(validateBatchTransition("DELIVERED", "PROCESSING")).toBe(false);
    });
  });

  describe("preScanForPII", () => {
    it("finds Indian mobiles, emails, handles and wa.me links at their offsets", () => {
      expect(preScanForPII("Call 9876543210 after 6pm")).toEqual([
        { type: "PHONE", value: "9876543210", index: 5 },
      ]);
      expect(preScanForPII("mail rahul@example.com today")).toEqual([
        { type: "EMAIL", value: "rahul@example.com", index: 5 },
      ]);
      expect(preScanForPII("ping @rahul_k tomorrow")).toEqual([
        { type: "SOCIAL_HANDLE", value: "@rahul_k", index: 5 },
      ]);
      expect(preScanForPII("https://wa.me/919876543210")).toContainEqual({
        type: "WHATSAPP",
        value: "https://wa.me/919876543210",
        index: 0,
      });
    });

    it("ignores deal details: rents, flat numbers and numbers outside the 6-9 mobile range", () => {
      expect(preScanForPII("Rent is 25000 for the 2BHK in flat 1203, deposit 75000")).toEqual([]);
      expect(preScanForPII("flat 5876543210")).toEqual([]);
    });

    it("detects Devanagari-digit phones only in normalized form, without a usable offset", () => {
      expect(preScanForPII("नंबर ९८७६५४३२१० है")).toEqual([
        { type: "PHONE", value: "9876543210", index: -1 },
      ]);
    });

    it("reports a phone once when several phone patterns match the same digits", () => {
      const matches = preScanForPII("call me at 9876543210 please");
      expect(matches).toEqual([{ type: "PHONE", value: "9876543210", index: 11 }]);
    });
  });

  describe("postCheckForPII", () => {
    it("catches residual contact details in AI output, including non-ASCII digits", () => {
      expect(postCheckForPII("The owner agrees to 28k rent from the 5th.")).toEqual([]);
      expect(postCheckForPII("Reach me on 9123456780")).toEqual([
        { type: "PHONE", value: "9123456780", index: 12 },
      ]);
      expect(postCheckForPII("संपर्क ९१२३४५६७८०").map((match) => match.value)).toEqual([
        "9123456780",
      ]);
    });
  });

  describe("preMaskPII", () => {
    it("replaces each non-overlapping match with its label and keeps the surrounding text", () => {
      expect(mask("Call 9876543210 after 6pm")).toBe("Call [PHONE] after 6pm");
      expect(mask("mail rahul@example.com or ping @rahul_k")).toBe("mail [EMAIL] or ping [HANDLE]");
      expect(mask("phone 98765 43210 now")).toBe("phone [PHONE] now");
    });

    it("skips normalized-only matches (index -1), leaving them for the AI and post-check", () => {
      const text = "नंबर ९८७६५४३२१० है";
      expect(mask(text)).toBe(text);
    });

    it.fails("keeps the words after a +91-prefixed mobile intact (BUG-020)", () => {
      expect(mask("+91 9876543210 thanks")).toBe("[PHONE] thanks");
    });

    it.fails("keeps the words after a wa.me link intact (BUG-020)", () => {
      expect(mask("wa.me/919876543210 bye")).toMatch(/^\[(WHATSAPP|PHONE)\] bye$/);
    });

    it.fails(
      "keeps the words after a phone that is also a WhatsApp number intact (BUG-020)",
      () => {
        expect(mask("my whatsapp is 9876543210 ok")).toMatch(
          /^my whatsapp is \[(WHATSAPP|PHONE)\] ok$/,
        );
      },
    );

    it.fails("never leaves part of an email behind when a handle overlaps it (BUG-020)", () => {
      const masked = mask("a.@b-mail.com hi");
      expect(masked).not.toContain("mail.com");
      expect(masked).toMatch(/^\[(EMAIL|HANDLE)\] hi$/);
    });
  });
});
