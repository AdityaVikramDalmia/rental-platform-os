export const IST_OFFSET_MS = 330 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function toUnixMs(date: Date): number {
  return date.getTime();
}

export function fromUnixMs(ms: number): Date {
  return new Date(ms);
}

export function formatDate(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(fromUnixMs(ms));
}

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(fromUnixMs(ms));
}

export function formatRelativeTime(ms: number): string {
  const now = Date.now();
  const diffMs = now - ms;

  if (diffMs < 0) return "Just now";

  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(ms);
}

export function getStartOfDayIST(nowMs: number = Date.now()): number {
  return Math.floor((nowMs + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

export function getISTDateKey(nowMs: number = Date.now()): string {
  const istMs = nowMs + IST_OFFSET_MS;
  const date = new Date(istMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getYesterdayISTDateKey(nowMs: number = Date.now()): string {
  return getISTDateKey(nowMs - DAY_MS);
}
