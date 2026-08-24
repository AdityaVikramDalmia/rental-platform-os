import { describe, expect, it } from "vitest";
import {
  generateFlatNumberPreview,
  normalizePhone,
  toSyntheticEmail,
  validateFlatNumberAgainstTemplate,
  validateFlatNumberTemplate,
  validateFloorLabels,
} from "../validators";

describe("normalizePhone", () => {
  it("returns a valid 10-digit phone number unchanged", () => {
    expect(normalizePhone("9876543210")).toBe("9876543210");
  });

  it("strips +91 prefix and spaces", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
  });

  it("strips dashes", () => {
    expect(normalizePhone("98765-43210")).toBe("9876543210");
  });

  it("throws for non-10-digit numbers", () => {
    expect(() => normalizePhone("12345")).toThrow();
  });
});

describe("toSyntheticEmail", () => {
  it("converts phone number to synthetic rental-platform-os email", () => {
    expect(toSyntheticEmail("9876543210")).toBe("9876543210@guards.local");
  });
});

describe("validateFloorLabels", () => {
  it("returns valid floor labels unchanged", () => {
    expect(validateFloorLabels(["B1", "G", "1", "2"])).toEqual(["B1", "G", "1", "2"]);
  });

  it("trims, uppercases, and keeps insertion order", () => {
    expect(validateFloorLabels(["b1", " g ", "2", "1"])).toEqual(["B1", "G", "2", "1"]);
  });

  it("removes empty labels", () => {
    expect(validateFloorLabels(["", "G", "   ", "1"])).toEqual(["G", "1"]);
  });

  it("throws when labels are empty after cleanup", () => {
    expect(() => validateFloorLabels(["", "  "])).toThrow("At least one floor label is required");
  });

  it("throws for duplicate labels", () => {
    expect(() => validateFloorLabels(["1", " 1 "])).toThrow("Duplicate floor label: 1");
  });
});

describe("validateFlatNumberTemplate", () => {
  it("accepts a valid template", () => {
    expect(() =>
      validateFlatNumberTemplate({
        floor_digits: 2,
        unit_digits: 2,
      }),
    ).not.toThrow();
  });

  it("rejects floor digits below range", () => {
    expect(() => validateFlatNumberTemplate({ floor_digits: 0, unit_digits: 2 })).toThrow(
      "Floor digits must be an integer between 1 and 4",
    );
  });

  it("rejects floor digits above range", () => {
    expect(() => validateFlatNumberTemplate({ floor_digits: 5, unit_digits: 2 })).toThrow(
      "Floor digits must be an integer between 1 and 4",
    );
  });

  it("rejects non-integer floor digits", () => {
    expect(() => validateFlatNumberTemplate({ floor_digits: 1.5, unit_digits: 2 })).toThrow(
      "Floor digits must be an integer between 1 and 4",
    );
  });

  it("rejects unit digits below range", () => {
    expect(() => validateFlatNumberTemplate({ floor_digits: 2, unit_digits: 0 })).toThrow(
      "Unit digits must be an integer between 1 and 4",
    );
  });

  it("rejects prefix longer than 10 characters", () => {
    expect(() =>
      validateFlatNumberTemplate({
        prefix: "ABCDEFGHIJK",
        floor_digits: 2,
        unit_digits: 2,
      }),
    ).toThrow("Flat number prefix must be 10 characters or fewer");
  });
});

describe("generateFlatNumberPreview", () => {
  it("generates preview with prefix", () => {
    expect(
      generateFlatNumberPreview({
        prefix: "A-",
        floor_digits: 2,
        unit_digits: 2,
      }),
    ).toBe("A-0101");
  });

  it("generates preview without prefix", () => {
    expect(
      generateFlatNumberPreview({
        floor_digits: 1,
        unit_digits: 3,
      }),
    ).toBe("1001");
  });

  it("supports varied digit lengths", () => {
    expect(
      generateFlatNumberPreview({
        prefix: "B/",
        floor_digits: 3,
        unit_digits: 1,
      }),
    ).toBe("B/0011");
  });
});

describe("validateFlatNumberAgainstTemplate", () => {
  it("matches numeric floor and unit", () => {
    expect(
      validateFlatNumberAgainstTemplate("A-0101", {
        prefix: "A-",
        floor_digits: 2,
        unit_digits: 2,
      }),
    ).toBe(true);
  });

  it("matches alphanumeric floor token with single letter", () => {
    expect(
      validateFlatNumberAgainstTemplate("A-G01", {
        prefix: "A-",
        floor_digits: 1,
        unit_digits: 2,
      }),
    ).toBe(true);
  });

  it("matches alphanumeric floor token with letter+digit", () => {
    expect(
      validateFlatNumberAgainstTemplate("A-B101", {
        prefix: "A-",
        floor_digits: 2,
        unit_digits: 2,
      }),
    ).toBe(true);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(
      validateFlatNumberAgainstTemplate("  a-g01  ", {
        prefix: "A-",
        floor_digits: 1,
        unit_digits: 2,
      }),
    ).toBe(true);
  });

  it("returns false for wrong prefix", () => {
    expect(
      validateFlatNumberAgainstTemplate("B-0101", {
        prefix: "A-",
        floor_digits: 2,
        unit_digits: 2,
      }),
    ).toBe(false);
  });

  it("returns false for wrong length", () => {
    expect(
      validateFlatNumberAgainstTemplate("A-101", {
        prefix: "A-",
        floor_digits: 2,
        unit_digits: 2,
      }),
    ).toBe(false);
  });

  it("returns false when unit portion contains non-digits", () => {
    expect(
      validateFlatNumberAgainstTemplate("A-01AB", {
        prefix: "A-",
        floor_digits: 2,
        unit_digits: 2,
      }),
    ).toBe(false);
  });

  it("returns false when floor portion contains special characters", () => {
    expect(
      validateFlatNumberAgainstTemplate("A-@101", {
        prefix: "A-",
        floor_digits: 2,
        unit_digits: 2,
      }),
    ).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(
      validateFlatNumberAgainstTemplate("", {
        prefix: "A-",
        floor_digits: 2,
        unit_digits: 2,
      }),
    ).toBe(false);
  });
});
