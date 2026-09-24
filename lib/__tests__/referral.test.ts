import { afterEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_MILESTONE_STATUS, REFERRAL_STATUS } from "../constants";
import {
  calculateSplitAmount,
  generateReferralCode,
  validateMilestoneTransition,
  validateReferralTransition,
} from "../referral";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function stubRandomSequence(values: number[]) {
  let index = 0;
  return vi.spyOn(Math, "random").mockImplementation(() => {
    const value = values[index % values.length]!;
    index += 1;
    return value;
  });
}

describe("lib/referral", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("calculateSplitAmount", () => {
    it("floors each share so independently computed splits never exceed the total", () => {
      const splitPairs: Array<[number, number]> = [
        [30, 70],
        [33, 67],
        [50, 50],
        [1, 99],
      ];

      for (let total = 0; total <= 2_000; total += 1) {
        for (const [first, second] of splitPairs) {
          const allocated =
            calculateSplitAmount(total, first) + calculateSplitAmount(total, second);
          expect(allocated).toBeLessThanOrEqual(total);
          expect(total - allocated).toBeLessThanOrEqual(1);
        }
      }
    });

    it("leaves the one-paisa remainder unallocated when a 30/70 split does not divide evenly", () => {
      expect(calculateSplitAmount(100_001, 30)).toBe(30_000);
      expect(calculateSplitAmount(100_001, 70)).toBe(70_000);
      expect(calculateSplitAmount(100_000, 30)).toBe(30_000);
      expect(calculateSplitAmount(12_345, 100)).toBe(12_345);
      expect(calculateSplitAmount(12_345, 0)).toBe(0);
    });

    it("rejects totals that are negative or not whole paise", () => {
      for (const total of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => calculateSplitAmount(total, 30)).toThrow(
          "totalPaise must be a non-negative integer",
        );
      }
    });

    it("rejects split percentages outside 0..100 or with a fractional part", () => {
      for (const pct of [-1, 101, 12.5, Number.NaN]) {
        expect(() => calculateSplitAmount(1_000, pct)).toThrow(
          "splitPct must be an integer between 0 and 100",
        );
      }
    });
  });

  describe("generateReferralCode", () => {
    it("prefixes FLAT- to five characters picked by Math.random from the code alphabet", () => {
      stubRandomSequence([0, 0.999_999, 0.5, 0.25, 0.75]);

      expect(generateReferralCode()).toBe("FLAT-A9SJ2");
    });

    it("never emits the look-alike characters I, O, 0 or 1", () => {
      const slotValues = Array.from({ length: CODE_ALPHABET.length }, (_, slot) => slot / 32);
      stubRandomSequence(slotValues);

      const seen = new Set<string>();
      for (let round = 0; round < 7; round += 1) {
        const code = generateReferralCode();
        expect(code).toMatch(/^FLAT-[A-Z2-9]{5}$/);
        for (const char of code.slice(5)) {
          seen.add(char);
        }
      }

      expect([...seen].sort().join("")).toBe([...CODE_ALPHABET].sort().join(""));
      for (const lookAlike of ["I", "O", "0", "1"]) {
        expect(seen.has(lookAlike)).toBe(false);
      }
    });
  });

  describe("validateReferralTransition", () => {
    it("moves referrals forward only and treats FULLY_PAID and VOIDED as terminal", () => {
      const statuses = Object.values(REFERRAL_STATUS);
      const allowed = new Set([
        "PENDING>QUALIFIED",
        "PENDING>VOIDED",
        "QUALIFIED>PARTIALLY_PAID",
        "QUALIFIED>FULLY_PAID",
        "QUALIFIED>VOIDED",
        "PARTIALLY_PAID>FULLY_PAID",
        "PARTIALLY_PAID>VOIDED",
      ]);

      for (const from of statuses) {
        for (const to of statuses) {
          expect(validateReferralTransition(from, to), `${from} -> ${to}`).toBe(
            allowed.has(`${from}>${to}`),
          );
        }
      }
    });
  });

  describe("validateMilestoneTransition", () => {
    it("requires TRIGGERED -> APPROVED -> PAID and lets any unpaid milestone be voided", () => {
      const statuses = Object.values(REFERRAL_MILESTONE_STATUS);
      const allowed = new Set([
        "PENDING>TRIGGERED",
        "PENDING>VOIDED",
        "TRIGGERED>APPROVED",
        "TRIGGERED>VOIDED",
        "APPROVED>PAID",
        "APPROVED>VOIDED",
      ]);

      for (const from of statuses) {
        for (const to of statuses) {
          expect(validateMilestoneTransition(from, to), `${from} -> ${to}`).toBe(
            allowed.has(`${from}>${to}`),
          );
        }
      }
    });
  });
});
