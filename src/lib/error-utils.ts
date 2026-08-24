/**
 * Sanitize error messages from Convex mutations.
 * Strips Convex-specific metadata like [CONVEX M(module:function)] and file paths.
 *
 * Example:
 * Input:  "[CONVEX M(societies:update)] ../convex/societies.ts:59:4 At least one building is required"
 * Output: "At least one building is required"
 */
export function sanitizeConvexError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "An error occurred";
  }

  let message = error.message;

  // Strip Convex metadata prefix: [CONVEX M(module:function)]
  message = message.replace(/^\[CONVEX M\([^)]+\)\]\s*/, "");

  // Strip file path and line number: ../convex/file.ts:123:4
  message = message.replace(/^\.\.\/.+?:\d+:\d+\s*/, "");

  // Clean up any remaining leading/trailing whitespace
  message = message.trim();

  return message || "An error occurred";
}
