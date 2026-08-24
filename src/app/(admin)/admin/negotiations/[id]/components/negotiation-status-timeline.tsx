"use client";

import { Clock3 } from "lucide-react";
import { NEGOTIATION_STATUS_LABELS } from "../../../../../../../lib/constants";
import { formatDateTime } from "../../../../../../../lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type NegotiationTimelineSource = {
  status: string;
  initiated_at: number;
  terms_agreed_at?: number;
  ready_for_closure_at?: number;
  failed_at?: number;
  last_activity_at: number;
};

type TimelineEvent = {
  key: string;
  label: string;
  at: number;
  note?: string;
};

type NegotiationStatusTimelineProps = {
  negotiation: NegotiationTimelineSource;
};

function buildTimelineEvents(negotiation: NegotiationTimelineSource): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      key: "initiated",
      label: NEGOTIATION_STATUS_LABELS.INITIATED,
      at: negotiation.initiated_at,
      note: "Negotiation opened",
    },
  ];

  if (negotiation.terms_agreed_at) {
    events.push({
      key: "terms_agreed",
      label: NEGOTIATION_STATUS_LABELS.TERMS_AGREED,
      at: negotiation.terms_agreed_at,
      note: "Both sides signed terms",
    });
  }

  if (negotiation.ready_for_closure_at) {
    events.push({
      key: "ready_for_closure",
      label: NEGOTIATION_STATUS_LABELS.READY_FOR_CLOSURE,
      at: negotiation.ready_for_closure_at,
      note: "Checklist complete",
    });
  }

  if (negotiation.failed_at) {
    events.push({
      key: "failed",
      label: NEGOTIATION_STATUS_LABELS.FAILED,
      at: negotiation.failed_at,
      note: "Marked failed",
    });
  }

  events.push({
    key: "current",
    label:
      NEGOTIATION_STATUS_LABELS[negotiation.status as keyof typeof NEGOTIATION_STATUS_LABELS] ??
      negotiation.status,
    at: negotiation.last_activity_at,
    note: "Current stage",
  });

  return events.sort((a, b) => a.at - b.at);
}

export function NegotiationStatusTimeline({ negotiation }: NegotiationStatusTimelineProps) {
  const events = buildTimelineEvents(negotiation);

  return (
    <Card className="border-slate-200 py-0">
      <CardHeader className="px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Clock3 className="size-4 text-slate-500" />
          Status Timeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {events.map((event, index) => (
          <div key={event.key} className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className="size-2.5 rounded-full bg-slate-500" />
              {index < events.length - 1 ? <span className="mt-1 h-8 w-px bg-slate-200" /> : null}
            </div>
            <div className="pb-2">
              <p className="text-sm font-medium text-slate-900">{event.label}</p>
              <p className="text-xs text-slate-500">{formatDateTime(event.at)}</p>
              {event.note ? <p className="text-xs text-slate-600">{event.note}</p> : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
