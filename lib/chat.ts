import type { ChatBatchStatus, ChatChannelStatus, ChatMessageStatus } from "./constants";

export function validateChannelTransition(
  current: ChatChannelStatus,
  next: ChatChannelStatus,
): boolean {
  const valid: Record<ChatChannelStatus, readonly ChatChannelStatus[]> = {
    ACTIVE: ["ARCHIVED"],
    ARCHIVED: ["ACTIVE"],
  };
  return (valid[current] ?? []).includes(next);
}

export function validateMessageTransition(
  current: ChatMessageStatus,
  next: ChatMessageStatus,
): boolean {
  const valid: Record<ChatMessageStatus, readonly ChatMessageStatus[]> = {
    SUBMITTED: ["BATCHED"],
    BATCHED: ["PROCESSING"],
    PROCESSING: ["DELIVERED", "FAILED"],
    DELIVERED: [],
    FAILED: ["DELIVERED"],
  };
  return (valid[current] ?? []).includes(next);
}

export function validateBatchTransition(current: ChatBatchStatus, next: ChatBatchStatus): boolean {
  const valid: Record<ChatBatchStatus, readonly ChatBatchStatus[]> = {
    COLLECTING: ["PROCESSING"],
    PROCESSING: ["DELIVERED", "FAILED"],
    DELIVERED: [],
    FAILED: ["DELIVERED"],
  };
  return (valid[current] ?? []).includes(next);
}

// Structured system messages carry ids after a prefix; list previews show them as plain text.
const SYSTEM_MESSAGE_PREVIEWS: ReadonlyArray<readonly [prefix: string, preview: string]> = [
  ["NEGOTIATION_PROPOSAL_SHARED:", "Terms proposal shared"],
  ["CHECKLIST_SHARED:", "Checklist shared"],
];

export function formatChannelPreview(content: string): string {
  const match = SYSTEM_MESSAGE_PREVIEWS.find(([prefix]) => content.startsWith(prefix));
  return match ? match[1] : content;
}

export type PIIMatch = {
  type: "PHONE" | "EMAIL" | "SOCIAL_HANDLE" | "WHATSAPP" | "AADHAAR" | "PAN";
  value: string;
  index: number;
};

export const INDIAN_PII_PATTERNS: Array<{
  type: PIIMatch["type"];
  pattern: RegExp;
  label: string;
  captureGroupIndex?: number;
}> = [
  {
    type: "PHONE",
    pattern: /(?:\+91[\s-]*|91[\s-]*|0[\s-]*)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g,
    label: "[PHONE]",
  },
  {
    type: "PHONE",
    pattern: /(?:\+91[\s-]*|91[\s-]*|0[\s-]*)?[6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g,
    label: "[PHONE]",
  },
  { type: "PHONE", pattern: /\b[6-9]\d{9}\b/g, label: "[PHONE]" },
  {
    type: "PHONE",
    pattern:
      /\b(?:call(?:\s+me)?(?:\s+(?:at|on))?|phone(?:\s+number)?|contact(?:\s+number)?|number|mobile|mob)\b[^\d\n]{0,20}((?:\+91[\s-]*|91[\s-]*|0[\s-]*)?[6-9]\d{4}[\s-]?\d{5})/gi,
    label: "[PHONE]",
    captureGroupIndex: 1,
  },
  {
    type: "EMAIL",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    label: "[EMAIL]",
  },
  { type: "SOCIAL_HANDLE", pattern: /(?<!\w)@[A-Za-z0-9_.]{1,30}\b/g, label: "[HANDLE]" },
  { type: "WHATSAPP", pattern: /(?:https?:\/\/)?wa\.me\/\d{10,15}/gi, label: "[WHATSAPP]" },
  {
    type: "WHATSAPP",
    pattern:
      /\b(?:my\s+)?(?:whatsapp|watsapp|whats\s*app)(?:\s+number)?(?:\s+(?:is|at))?[\s:.-]*((?:\+91[\s-]*|91[\s-]*|0[\s-]*)?[6-9]\d{4}[\s-]?\d{5})/gi,
    label: "[WHATSAPP]",
    captureGroupIndex: 1,
  },
  {
    type: "WHATSAPP",
    pattern:
      /\b(?:wa|wp)(?:\s*[:-]|\s+)(?:me\s+(?:at|on)\s+)?((?:\+91[\s-]*|91[\s-]*|0[\s-]*)?[6-9]\d{4}[\s-]?\d{5})/gi,
    label: "[WHATSAPP]",
    captureGroupIndex: 1,
  },
];

function normalizeForPII(text: string): string {
  let normalized = text;

  // Devanagari digits (Hindi) — U+0966-U+096F
  normalized = normalized.replace(/[०-९]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x0966 + 48),
  );

  // Arabic-Indic digits — U+0660-U+0669
  normalized = normalized.replace(/[٠-٩]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x0660 + 48),
  );

  normalized = normalized.replace(/([0-9])\uFE0F?\u20E3/gu, "$1");

  normalized = normalized.replace(/[\uFF10-\uFF19]/gu, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  );

  return normalized;
}

function collectPIIMatches(text: string, fallbackIndex = false): PIIMatch[] {
  const matches: PIIMatch[] = [];

  for (const { type, pattern, captureGroupIndex } of INDIAN_PII_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
      const groupIndex = captureGroupIndex ?? 0;
      const value = match[groupIndex];
      if (!value) {
        continue;
      }

      if (fallbackIndex) {
        matches.push({ type, value, index: -1 });
        continue;
      }

      const offset = groupIndex === 0 ? 0 : match[0].indexOf(value);
      if (offset < 0) {
        continue;
      }

      matches.push({ type, value, index: match.index + offset });
    }
  }

  return matches;
}

export function preScanForPII(text: string): PIIMatch[] {
  const originalMatches = collectPIIMatches(text);
  const normalized = normalizeForPII(text);
  const normalizedMatches = normalized !== text ? collectPIIMatches(normalized, true) : [];
  const matches = [...originalMatches, ...normalizedMatches];

  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.type}:${match.value}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function postCheckForPII(text: string): PIIMatch[] {
  return preScanForPII(text);
}

export function preMaskPII(text: string, matches: PIIMatch[]): string {
  const sorted = [...matches].filter((match) => match.index >= 0).sort((a, b) => b.index - a.index);
  let masked = text;

  for (const match of sorted) {
    const label =
      INDIAN_PII_PATTERNS.find((pattern) => pattern.type === match.type)?.label ?? "[REDACTED]";
    masked = masked.slice(0, match.index) + label + masked.slice(match.index + match.value.length);
  }

  return masked;
}
