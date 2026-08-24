"use client";

import { useEffect, useState } from "react";
import { SLA_POLICIES, SLA_STATUS, type SLAStatus } from "../../../lib/constants";
import { cn } from "@/lib/utils";

type SLABadgeProps = {
  entity_type: "lead" | "visit" | "payout";
  sla_started_at_ms: number;
  now_ms?: number;
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Breached";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h left`;
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m left`;
}

function getStatus(entityType: "lead" | "visit" | "payout", elapsedMs: number): SLAStatus {
  const policy = SLA_POLICIES[entityType];

  if (elapsedMs >= policy.windowMs) {
    return SLA_STATUS.BREACHED;
  }

  if (elapsedMs / policy.windowMs >= policy.warningThreshold) {
    return SLA_STATUS.WARNING;
  }

  return SLA_STATUS.ON_TRACK;
}

const STATUS_CLASSES: Record<SLAStatus, { text: string; dot: string; pulse: boolean }> = {
  [SLA_STATUS.ON_TRACK]: {
    text: "text-green-600",
    dot: "bg-green-500",
    pulse: false,
  },
  [SLA_STATUS.WARNING]: {
    text: "text-amber-600",
    dot: "bg-amber-500",
    pulse: false,
  },
  [SLA_STATUS.BREACHED]: {
    text: "text-red-600",
    dot: "bg-red-500",
    pulse: true,
  },
};

export function SLABadge({ entity_type, sla_started_at_ms, now_ms }: SLABadgeProps) {
  const [liveNowMs, setLiveNowMs] = useState(() => now_ms ?? Date.now());

  useEffect(() => {
    if (now_ms !== undefined) {
      return;
    }

    const interval = window.setInterval(() => {
      setLiveNowMs(Date.now());
    }, 60 * 1000);

    return () => window.clearInterval(interval);
  }, [now_ms]);

  const effectiveNowMs = now_ms ?? liveNowMs;
  const elapsedMs = Math.max(0, effectiveNowMs - sla_started_at_ms);
  const remainingMs = SLA_POLICIES[entity_type].windowMs - elapsedMs;
  const status = getStatus(entity_type, elapsedMs);
  const classes = STATUS_CLASSES[status];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap text-xs font-medium",
        classes.text,
      )}
    >
      <span
        className={cn("size-2 rounded-full", classes.dot, classes.pulse ? "animate-pulse" : "")}
      />
      <span>{formatRemaining(remainingMs)}</span>
    </div>
  );
}
