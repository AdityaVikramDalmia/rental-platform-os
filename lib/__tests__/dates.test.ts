import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DAY_MS,
  IST_OFFSET_MS,
  formatDate,
  formatRelativeTime,
  getISTDateKey,
  getStartOfDayIST,
  getYesterdayISTDateKey,
} from "../dates";

const at = (iso: string) => Date.parse(iso);

describe("lib/dates", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getStartOfDayIST", () => {
    it("rolls to the next IST day at 18:30 UTC, not at UTC midnight", () => {
      expect(IST_OFFSET_MS).toBe(5.5 * 60 * 60 * 1000);
      expect(getStartOfDayIST(at("2026-01-01T18:29:59.999Z"))).toBe(at("2025-12-31T18:30:00.000Z"));
      expect(getStartOfDayIST(at("2026-01-01T18:30:00.000Z"))).toBe(at("2026-01-01T18:30:00.000Z"));
      expect(getStartOfDayIST(at("2026-01-01T23:59:00.000Z"))).toBe(at("2026-01-01T18:30:00.000Z"));
    });
  });

  describe("getISTDateKey", () => {
    it("labels the instant with its IST calendar date", () => {
      expect(getISTDateKey(at("2026-01-01T18:29:59.999Z"))).toBe("2026-01-01");
      expect(getISTDateKey(at("2026-01-01T18:30:00.000Z"))).toBe("2026-01-02");
      expect(getISTDateKey(at("2025-12-31T18:30:00.000Z"))).toBe("2026-01-01");
    });

    it("has yesterday's key exactly one IST day earlier, across a month boundary", () => {
      const now = at("2026-03-01T00:00:00.000Z");
      expect(getISTDateKey(now)).toBe("2026-03-01");
      expect(getYesterdayISTDateKey(now)).toBe("2026-02-28");
      expect(getYesterdayISTDateKey(now)).toBe(getISTDateKey(now - DAY_MS));
    });
  });

  describe("formatRelativeTime", () => {
    it("steps from minutes to hours to days relative to now", () => {
      vi.useFakeTimers();
      const now = at("2026-05-20T12:00:00.000Z");
      vi.setSystemTime(now);

      expect(formatRelativeTime(now + 60_000)).toBe("Just now");
      expect(formatRelativeTime(now - 59_999)).toBe("Just now");
      expect(formatRelativeTime(now - 5 * 60_000)).toBe("5m ago");
      expect(formatRelativeTime(now - 59 * 60_000)).toBe("59m ago");
      expect(formatRelativeTime(now - 23 * 3_600_000)).toBe("23h ago");
      expect(formatRelativeTime(now - DAY_MS)).toBe("Yesterday");
      expect(formatRelativeTime(now - 6 * DAY_MS)).toBe("6d ago");
    });

    it("falls back to the absolute date from seven days on", () => {
      vi.useFakeTimers();
      const now = at("2026-05-20T12:00:00.000Z");
      vi.setSystemTime(now);
      const weekAgo = now - 7 * DAY_MS;

      expect(formatRelativeTime(weekAgo)).toBe(formatDate(weekAgo));
    });
  });

  describe("formatDate", () => {
    it("renders day, short month and year in the en-IN order", () => {
      // 06:30 UTC is the same calendar day in UTC and IST, so this holds in either zone.
      expect(formatDate(at("2026-03-15T06:30:00.000Z"))).toBe("15 Mar 2026");
    });
  });
});
