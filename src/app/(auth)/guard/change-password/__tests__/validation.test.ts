import { describe, expect, it } from "vitest";
import { z } from "zod";

const guardChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

describe("guardChangePasswordSchema", () => {
  it("accepts matching passwords with minimum length", () => {
    const result = guardChangePasswordSchema.safeParse({
      currentPassword: "temp-password",
      newPassword: "new-password-123",
      confirmPassword: "new-password-123",
    });

    expect(result.success).toBe(true);
  });

  it("rejects mismatched confirmation password", () => {
    const result = guardChangePasswordSchema.safeParse({
      currentPassword: "temp-password",
      newPassword: "new-password-123",
      confirmPassword: "different-password",
    });

    expect(result.success).toBe(false);
  });

  it("rejects new passwords shorter than 8 characters", () => {
    const result = guardChangePasswordSchema.safeParse({
      currentPassword: "temp-password",
      newPassword: "short7!",
      confirmPassword: "short7!",
    });

    expect(result.success).toBe(false);
  });
});
