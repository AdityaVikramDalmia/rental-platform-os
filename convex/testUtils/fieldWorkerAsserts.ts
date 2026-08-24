import { expect } from "vitest";

export async function assertFieldWorkerBlocked<T>(
  fn: () => Promise<T>,
  expectedError = "Feature not enabled",
): Promise<void> {
  await expect(fn()).rejects.toThrow(expectedError);
}

export async function assertFieldWorkerAllowed<T>(fn: () => Promise<T>): Promise<T> {
  return await fn();
}
