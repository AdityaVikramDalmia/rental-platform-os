import { describe, expect, it } from "vitest";
import { formatINR, paiseToRupees, rupeesToPaise } from "../money";

describe("lib/money", () => {
  describe("rupeesToPaise", () => {
    it("converts every whole-paise rupee amount up to ₹1,000 exactly despite binary float error", () => {
      const mismatches: number[] = [];

      for (let paise = 0; paise <= 100_000; paise += 1) {
        if (rupeesToPaise(paise / 100) !== paise) {
          mismatches.push(paise);
        }
      }

      expect(mismatches).toEqual([]);
      expect(rupeesToPaise(25_000)).toBe(2_500_000);
      expect(rupeesToPaise(19.99)).toBe(1999);
    });

    it("currently rounds half-paise inputs by their float representation, not half-up", () => {
      // 1.005 * 100 === 100.49999999999999 and 0.285 * 100 === 28.499999999999996,
      // while 0.125 * 100 is exactly 12.5; so "half a paisa" rounds down twice and up once.
      expect(rupeesToPaise(1.005)).toBe(100);
      expect(rupeesToPaise(0.285)).toBe(28);
      expect(rupeesToPaise(0.125)).toBe(13);
    });

    it("currently returns negative zero for a negative amount smaller than half a paisa", () => {
      expect(Object.is(rupeesToPaise(-0.001), -0)).toBe(true);
      expect(rupeesToPaise(-0.01)).toBe(-1);
    });
  });

  describe("paiseToRupees", () => {
    it("inverts rupeesToPaise for whole paise amounts", () => {
      for (const paise of [0, 1, 99, 150, 2_500_000, 1_234_567_890]) {
        expect(rupeesToPaise(paiseToRupees(paise))).toBe(paise);
      }
      expect(paiseToRupees(2_500_000)).toBe(25_000);
      expect(paiseToRupees(1)).toBe(0.01);
    });
  });

  describe("formatINR", () => {
    it("renders paise as rupees with Indian lakh/crore grouping and at most two decimals", () => {
      expect(formatINR(2_500_000)).toBe("₹25,000");
      expect(formatINR(1_234_567_890)).toBe("₹1,23,45,678.9");
      expect(formatINR(150)).toBe("₹1.5");
      expect(formatINR(1)).toBe("₹0.01");
      expect(formatINR(0)).toBe("₹0");
    });

    it("currently prints a minus sign for the negative zero produced by a tiny negative amount", () => {
      expect(formatINR(rupeesToPaise(-0.001))).toBe("-₹0");
    });
  });
});
