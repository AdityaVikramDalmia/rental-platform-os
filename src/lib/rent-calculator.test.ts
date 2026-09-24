import { describe, expect, it } from "vitest";
import { calculateRentCosts } from "./rent-calculator";

describe("rent-calculator", () => {
  describe("calculateRentCosts", () => {
    it("adds deposit, first month's rent, brokerage and maintenance for the move-in cost", () => {
      // The /tools slider defaults: ₹20,000 rent, 2 months deposit, ₹2,000 maintenance, 10% brokerage.
      expect(
        calculateRentCosts({
          monthlyRent: 20000,
          depositMonths: 2,
          maintenance: 2000,
          brokerage: 10,
        }),
      ).toEqual({
        depositAmount: 40000,
        brokerageAmount: 2000,
        totalMoveInCost: 64000,
        monthlyRecurring: 22000,
      });
    });

    it("handles zero maintenance and zero brokerage", () => {
      expect(
        calculateRentCosts({ monthlyRent: 35000, depositMonths: 3, maintenance: 0, brokerage: 0 }),
      ).toEqual({
        depositAmount: 105000,
        brokerageAmount: 0,
        totalMoveInCost: 140000,
        monthlyRecurring: 35000,
      });
    });

    it("keeps fractional brokerage percentages exact", () => {
      const result = calculateRentCosts({
        monthlyRent: 40000,
        depositMonths: 1,
        maintenance: 500,
        brokerage: 7.5,
      });
      expect(result.brokerageAmount).toBe(3000);
      expect(result.totalMoveInCost).toBe(40000 + 40000 + 3000 + 500);
    });

    it("clamps negative inputs to zero instead of producing refunds", () => {
      expect(
        calculateRentCosts({
          monthlyRent: 20000,
          depositMonths: -2,
          maintenance: -500,
          brokerage: -10,
        }),
      ).toEqual({
        depositAmount: 0,
        brokerageAmount: 0,
        totalMoveInCost: 20000,
        monthlyRecurring: 20000,
      });
      expect(
        calculateRentCosts({ monthlyRent: -1, depositMonths: 2, maintenance: 1000, brokerage: 10 })
          .totalMoveInCost,
      ).toBe(1000);
    });

    it("currently lets brokerage above 100% through uncapped", () => {
      expect(
        calculateRentCosts({ monthlyRent: 10000, depositMonths: 0, maintenance: 0, brokerage: 150 })
          .brokerageAmount,
      ).toBe(15000);
    });

    it("currently propagates NaN from a non-numeric input into every total", () => {
      const result = calculateRentCosts({
        monthlyRent: Number.NaN,
        depositMonths: 2,
        maintenance: 1000,
        brokerage: 10,
      });
      expect(Number.isNaN(result.totalMoveInCost)).toBe(true);
      expect(Number.isNaN(result.depositAmount)).toBe(true);
      expect(Number.isNaN(result.monthlyRecurring)).toBe(true);
    });
  });
});
