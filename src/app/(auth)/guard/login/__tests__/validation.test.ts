import { describe, expect, it } from "vitest";
import { z } from "zod";

const guardLoginSchema = z.object({
  phone: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^\d{10}$/, "Enter a valid 10-digit phone number"),
  password: z.string().min(1, "Password is required"),
});

describe("guardLoginSchema", () => {
  it("accepts valid 10-digit phone and password", () => {
    const result = guardLoginSchema.safeParse({
      phone: "9876543210",
      password: "password123",
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty phone", () => {
    const result = guardLoginSchema.safeParse({
      phone: "",
      password: "password123",
    });

    expect(result.success).toBe(false);
  });

  it("rejects 9-digit phone", () => {
    const result = guardLoginSchema.safeParse({
      phone: "987654321",
      password: "password123",
    });

    expect(result.success).toBe(false);
  });

  it("rejects 11-digit phone", () => {
    const result = guardLoginSchema.safeParse({
      phone: "98765432101",
      password: "password123",
    });

    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = guardLoginSchema.safeParse({
      phone: "9876543210",
      password: "",
    });

    expect(result.success).toBe(false);
  });
});
